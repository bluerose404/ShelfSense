import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Upload } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

export interface ForecastItem {
  target_date: string;
  day_name: string;
  menu_code: string;
  menu_name_ko: string;
  menu_name_en: string;
  daypart: string;
  median_portions: number;
  upper_portions: number;
  projected_revenue_krw: number;
  selected_model: string;
  baseline_wape: number;
  model_wape: number;
  fva: number;
}

export interface DailyForecastChartRow {
  date: string;
  day: string;
  medianCovers: number;
  upperTotal: number;
  upperDelta: number;
  revenue: number;
}

export function aggregateDailyForecastTotals(
  forecastData: ForecastItem[],
  selectedDaypart: string = 'all'
): DailyForecastChartRow[] {
  return Object.values(
    forecastData
      .filter(item => selectedDaypart === 'all' || item.daypart === selectedDaypart)
      .reduce((acc: Record<string, DailyForecastChartRow>, cur) => {
        const key = cur.target_date;
        if (!acc[key]) {
          acc[key] = {
            date: cur.target_date.substring(5), // MM-DD
            day: cur.day_name,
            medianCovers: 0,
            upperTotal: 0,
            upperDelta: 0,
            revenue: 0,
          };
        }
        acc[key].medianCovers += cur.median_portions;
        acc[key].upperTotal += cur.upper_portions;
        acc[key].upperDelta = Math.max(0, acc[key].upperTotal - acc[key].medianCovers);
        acc[key].revenue += cur.projected_revenue_krw;
        return acc;
      }, {})
  );
}

export default function ForecastView() {
  const { i18n } = useTranslation();
  const [forecastData, setForecastData] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDaypart, setSelectedDaypart] = useState<string>('all');
  const [csvResult, setCsvResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/forecast/7day')
      .then(res => res.json())
      .then(data => {
        setForecastData(data.forecast || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/forecast/check-csv', {
      method: 'POST',
      body: formData,
    })
      .then(res => res.json())
      .then(data => setCsvResult(data))
      .catch(err => console.error(err));
  };

  const isKo = i18n.language.startsWith('ko');

  // Aggregate by target_date for the main chart with non-double-counted stacked upperDelta
  const dailyTotals = aggregateDailyForecastTotals(forecastData, selectedDaypart);

  return (
    <div className="space-y-6">
      {/* Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isKo ? '7일 수요 예측 & 백테스트' : '7-Day Demand Forecast & Backtest'}
          </h2>
          <p className="text-sm text-gray-500">
            {isKo 
              ? '머신러닝(HistGradientBoosting)과 4주 이동평균 베이스라인의 롤링 원점 백테스트 비교'
              : 'Rolling-origin walk-forward backtest comparison: HistGradientBoosting vs 4-Week Mean baseline'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-sm">
            <Upload className="w-3.5 h-3.5 text-teal-700" />
            <span>{isKo ? '매출 CSV 무결성 검사' : 'Validate Sales CSV'}</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
            <button
              onClick={() => setSelectedDaypart('all')}
              className={`px-3 py-1 rounded-md transition ${selectedDaypart === 'all' ? 'bg-white shadow text-teal-800' : 'text-gray-600'}`}
            >
              {isKo ? '전체 (종일)' : 'All Day'}
            </button>
            <button
              onClick={() => setSelectedDaypart('lunch')}
              className={`px-3 py-1 rounded-md transition ${selectedDaypart === 'lunch' ? 'bg-white shadow text-teal-800' : 'text-gray-600'}`}
            >
              {isKo ? '점심' : 'Lunch'}
            </button>
            <button
              onClick={() => setSelectedDaypart('dinner')}
              className={`px-3 py-1 rounded-md transition ${selectedDaypart === 'dinner' ? 'bg-white shadow text-teal-800' : 'text-gray-600'}`}
            >
              {isKo ? '저녁' : 'Dinner'}
            </button>
          </div>
        </div>
      </div>

      {/* CSV Quality Checker Banner if Uploaded */}
      {csvResult && (
        <div className="p-4 bg-white border rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-800">
              {isKo ? 'CSV 검사 결과 (총 행 수: ' : 'CSV Quality Report (Total Rows: '}
              {csvResult.total_rows})
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${csvResult.valid ? 'bg-teal-100 text-teal-800' : 'bg-red-100 text-red-800'}`}>
              {csvResult.valid ? (isKo ? '정상 포맷' : 'Valid') : (isKo ? '오류 발견' : 'Invalid')}
            </span>
          </div>
          {csvResult.errors.length > 0 && (
            <div className="text-xs text-red-600 space-y-1">
              {csvResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
            </div>
          )}
          {csvResult.warnings.length > 0 && (
            <div className="text-xs text-amber-700 space-y-1">
              {csvResult.warnings.map((w: string, i: number) => <p key={i}>• {w}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Honest Backtest Banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-900 flex items-start space-x-3">
        <Info className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">
            {isKo ? '정직한 8주 롤링 원점 백테스트 (Rolling-Origin Evaluation)' : 'Honest 8-Week Rolling-Origin Backtest'}
          </p>
          <p className="text-teal-800 mt-0.5">
            {isKo
              ? '폴드 1~4에서 모델을 자동 선택하고 상한 분위수를 보정했으며, 폴드 5~8(최근 4주) 홀드아웃 평가로 미래 데이터 누수를 엄격히 차단했습니다. 상한선 막대는 중앙 예측치 위에 안전 버퍼(P90 잔차)가 누적된 스택 형태로 표시됩니다.'
              : 'Models selected and quantile calibrated on folds 1-4; unbiased performance reported on holdout folds 5-8 with zero future leakage. Upper bound is stacked cleanly as safety buffer over median.'}
          </p>
          <p className="text-teal-700 font-medium mt-1">
            * {isKo ? '표시된 정확도는 합성 데모 데이터(Synthetic Demo Data) 기준입니다.' : 'Accuracy shown is on synthetic demo data.'}
          </p>
        </div>
      </div>

      {/* Main Forecast Chart with Clean Non-Double-Counted Stack */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4 text-sm flex items-center justify-between">
          <span>{isKo ? '향후 7일 예상 식수 (중앙값 + 안전 상한 버퍼)' : 'Next 7 Days Projected Covers (Median + Safety Buffer)'}</span>
          <span className="text-xs font-normal text-gray-500">
            {isKo ? '단위: 식수(그릇)' : 'Unit: Portions'}
          </span>
        </h3>
        
        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-400">
            {isKo ? '예측 데이터 계산 중...' : 'Computing rolling forecasts...'}
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTotals}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: any, name: any, item: any) => {
                    if (name === 'medianCovers') {
                      return [`${value} ${isKo ? '식' : 'portions'}`, isKo ? '중앙 예상치' : 'Median Forecast'];
                    }
                    if (name === 'upperDelta') {
                      const total = item.payload.upperTotal;
                      return [`+${value} (총 상한 ${total}식)`, isKo ? '안전 버퍼 (P90)' : 'Safety Buffer (P90)'];
                    }
                    return [value, name];
                  }}
                />
                <Legend 
                  formatter={(value) => value === 'medianCovers' ? (isKo ? '중앙 예측' : 'Median Forecast') : (isKo ? '안전 상한 버퍼 (P90 잔차)' : 'Safety Buffer (P90 Residual)')}
                />
                {/* Stacked Cleanly: medianCovers + upperDelta = upperTotal */}
                <Bar dataKey="medianCovers" stackId="covers" fill="#078B79" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="upperDelta" stackId="covers" fill="#99D5CE" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detailed Forecast & Model Selection Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm">
            {isKo ? '메뉴별 예측 및 백테스트 성과표' : 'Menu Forecast & Backtest Performance'}
          </h3>
          <span className="text-xs text-gray-500">
            FVA (Forecast Value Added) = (Baseline WAPE - Model WAPE) / Baseline
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">{isKo ? '날짜' : 'Date'}</th>
                <th className="px-4 py-3">{isKo ? '메뉴' : 'Menu Item'}</th>
                <th className="px-4 py-3">{isKo ? '시간대' : 'Daypart'}</th>
                <th className="px-4 py-3 text-right">{isKo ? '중앙 예상' : 'Median'}</th>
                <th className="px-4 py-3 text-right">{isKo ? '상한선' : 'Upper (P90)'}</th>
                <th className="px-4 py-3 text-right">{isKo ? '예상 매출' : 'Revenue'}</th>
                <th className="px-4 py-3">{isKo ? '채택 모델' : 'Selected Model'}</th>
                <th className="px-4 py-3 text-right">{isKo ? '모델 WAPE' : 'Model WAPE'}</th>
                <th className="px-4 py-3 text-right">{isKo ? '기준 WAPE' : 'Base WAPE'}</th>
                <th className="px-4 py-3 text-right">FVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {forecastData.slice(0, 30).map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {row.target_date} ({row.day_name})
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">
                    {isKo ? row.menu_name_ko : row.menu_name_en}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{row.daypart}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-teal-800">
                    {row.median_portions}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {row.upper_portions}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    ₩{row.projected_revenue_krw.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-2xs font-bold uppercase ${
                      row.selected_model === 'ml' 
                        ? 'bg-teal-100 text-teal-800' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {row.selected_model}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {(row.model_wape * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-400">
                    {(row.baseline_wape * 100).toFixed(1)}%
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${row.fva >= 0 ? 'text-teal-700' : 'text-coral-600'}`}>
                    {(row.fva * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
