import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
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
    <div>
      <h1 className="ss-page-title">
        {isKo ? '7일 수요 예측 및 백테스트' : '7-day demand forecast & backtest'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? '머신러닝(HistGradientBoosting)과 4주 이동평균 기준선의 8주 롤링 원점 백테스트 비교입니다.'
          : '8-fold rolling-origin walk-forward backtest comparing HistGradientBoosting against the 4-week mean baseline.'}
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="inline-flex border border-ink">
          {([
            { id: 'all', ko: '전체 (종일)', en: 'All day' },
            { id: 'lunch', ko: '점심', en: 'Lunch' },
            { id: 'dinner', ko: '저녁', en: 'Dinner' },
          ] as const).map(dp => {
            const active = selectedDaypart === dp.id;
            return (
              <button
                key={dp.id}
                type="button"
                onClick={() => setSelectedDaypart(dp.id)}
                className={`px-3 py-2 text-sm font-bold cursor-pointer ${
                  active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                }`}
              >
                {isKo ? dp.ko : dp.en}
              </button>
            );
          })}
        </div>

        <label className="ss-btn ss-btn-secondary ss-btn-sm">
          <Upload className="w-4 h-4" aria-hidden="true" />
          <span>{isKo ? '매출 CSV 무결성 검사' : 'Check sales CSV'}</span>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* CSV Quality Checker Banner if Uploaded */}
      {csvResult && (
        <div className="ss-note mb-6">
          {csvResult.valid ? (
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          )}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm">
                {isKo ? 'CSV 검사 결과 (총 행 수: ' : 'CSV quality report (total rows: '}
                {csvResult.total_rows})
              </span>
              <span className={`ss-chip ${csvResult.valid ? 'ss-chip-ok' : 'ss-chip-critical'}`}>
                {csvResult.valid ? (isKo ? '정상 포맷' : 'Valid') : (isKo ? '오류 발견' : 'Invalid')}
              </span>
            </div>
            {csvResult.errors.length > 0 && (
              <div className="text-xs space-y-1">
                {csvResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
              </div>
            )}
            {csvResult.warnings.length > 0 && (
              <div className="text-xs ss-muted space-y-1">
                {csvResult.warnings.map((w: string, i: number) => <p key={i}>• {w}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Honest Backtest Note */}
      <div className="ss-note mb-8">
        <Info className="w-4 h-4" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-bold text-sm">
            {isKo ? '정직한 8주 롤링 원점 백테스트 (Rolling-Origin Evaluation)' : '8-week rolling-origin backtest'}
          </p>
          <p className="text-sm ss-muted">
            {isKo
              ? '폴드 1~4에서 모델을 선택하고 상한 분위수를 보정했으며, 폴드 5~8(최근 4주) 홀드아웃 평가로 미래 데이터 누수를 차단했습니다. 상한선 막대는 중앙 예측치 위에 안전 버퍼(upper − median)가 누적된 스택으로 표시됩니다.'
              : 'Models are selected and calibrated on folds 1–4; holdout performance is reported on folds 5–8 with zero future leakage. The upper bound is stacked as (upper − median) on top of the median forecast.'}
          </p>
          <p className="ss-meta">
            {isKo ? '표시된 정확도는 합성 데모 데이터(seed=42) 기준입니다.' : 'Accuracy is measured on deterministic synthetic demo data (seed=42).'}
          </p>
        </div>
      </div>

      {/* Main Forecast Chart with Clean Non-Double-Counted Stack */}
      <section className="ss-section">
        <div className="ss-section-title justify-between">
          <span>{isKo ? '향후 7일 예상 식수 (중앙값 + 상한 안전 버퍼)' : 'Next 7 days projected covers (median + upper buffer)'}</span>
          <span className="ss-meta font-normal">
            {isKo ? '단위: 식수(그릇)' : 'Unit: portions'}
          </span>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm ss-muted">
            {isKo ? '예측 데이터 계산 중...' : 'Computing rolling forecasts...'}
          </div>
        ) : (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTotals}>
                <defs>
                  <pattern
                    id="ss-hatch"
                    patternUnits="userSpaceOnUse"
                    width="6"
                    height="6"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="#ffffff" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#0d67f7" strokeWidth="3" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(4,34,92,0.15)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'rgba(4,34,92,0.7)' }}
                  stroke="rgba(4,34,92,0.35)"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'rgba(4,34,92,0.7)' }}
                  stroke="rgba(4,34,92,0.35)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #04225c',
                    borderRadius: '2px',
                    boxShadow: 'none',
                    color: '#04225c',
                    fontSize: '12px',
                  }}
                  formatter={(value: any, name: any, item: any) => {
                    if (name === 'medianCovers') {
                      return [`${value} ${isKo ? '식' : 'portions'}`, isKo ? '중앙 예상 (Median)' : 'Expected (median)'];
                    }
                    if (name === 'upperDelta') {
                      const total = item.payload.upperTotal;
                      return [
                        `+${value} (${isKo ? `총 상한 ${total}식` : `upper total ${total}`})`,
                        isKo ? '추가 안전 버퍼 (P90)' : 'Possible extra (upper bound)',
                      ];
                    }
                    return [value, name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: '#04225c' }}
                  formatter={(value) =>
                    value === 'medianCovers'
                      ? isKo ? '중앙 예상 (Median)' : 'Expected (median)'
                      : isKo ? '추가 안전 버퍼 (upper − median)' : 'Possible extra (upper bound)'
                  }
                />
                {/* Stacked Cleanly: medianCovers + upperDelta = upperTotal */}
                <Bar dataKey="medianCovers" stackId="covers" fill="#04225c" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="upperDelta" stackId="covers" fill="url(#ss-hatch)" stroke="#0d67f7" strokeWidth={1} radius={[0, 0, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Detailed Forecast & Model Selection Table */}
      <section className="ss-section">
        <div className="ss-section-title justify-between flex-wrap">
          <span>{isKo ? '메뉴별 예측 및 백테스트 성과표' : 'Menu forecast & backtest performance'}</span>
          <span className="ss-meta font-normal">
            FVA = (Baseline WAPE − Model WAPE) / Baseline WAPE
          </span>
        </div>

        <div className="ss-table-wrap">
          <table className="ss-table">
            <thead>
              <tr>
                <th>{isKo ? '날짜' : 'Date'}</th>
                <th>{isKo ? '메뉴' : 'Menu item'}</th>
                <th>{isKo ? '시간대' : 'Daypart'}</th>
                <th className="ss-num">{isKo ? '중앙 예상' : 'Median'}</th>
                <th className="ss-num">{isKo ? '상한선 (P90)' : 'Upper (P90)'}</th>
                <th className="ss-num">{isKo ? '예상 매출' : 'Revenue'}</th>
                <th>{isKo ? '채택 모델' : 'Selected model'}</th>
                <th className="ss-num">{isKo ? '모델 WAPE' : 'Model WAPE'}</th>
                <th className="ss-num">{isKo ? '기준 WAPE' : 'Base WAPE'}</th>
                <th className="ss-num">FVA</th>
              </tr>
            </thead>
            <tbody>
              {forecastData.slice(0, 30).map((row, idx) => (
                <tr key={idx}>
                  <td className="whitespace-nowrap tabular-nums">
                    {row.target_date} ({row.day_name})
                  </td>
                  <td className="font-bold whitespace-nowrap">
                    {isKo ? row.menu_name_ko : row.menu_name_en}
                  </td>
                  <td className="capitalize">{row.daypart}</td>
                  <td className="ss-num font-bold">{row.median_portions}</td>
                  <td className="ss-num ss-muted">{row.upper_portions}</td>
                  <td className="ss-num">₩{row.projected_revenue_krw.toLocaleString()}</td>
                  <td>
                    <span className={`ss-chip ${row.selected_model === 'ml' ? 'ss-chip-info' : 'ss-chip-ok'}`}>
                      {row.selected_model === 'ml' ? 'HistGBM' : row.selected_model}
                    </span>
                  </td>
                  <td className="ss-num">{(row.model_wape * 100).toFixed(1)}%</td>
                  <td className="ss-num ss-muted">{(row.baseline_wape * 100).toFixed(1)}%</td>
                  <td className="ss-num font-bold">{(row.fva * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
