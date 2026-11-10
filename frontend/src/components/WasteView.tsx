import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, PlusCircle, CheckCircle2 } from 'lucide-react';

export interface WasteLogRow {
  id: number;
  log_datetime: string;
  ingredient_id: number;
  ingredient_code: string | null;
  ingredient_name_ko: string;
  ingredient_name_en: string;
  unit: string;
  lot_id: number | null;
  quantity: number;
  cost_krw: number;
  reason: string;
  notes: string | null;
}

export interface IngredientOption {
  id: number;
  code: string;
  name_ko: string;
  name_en: string;
  unit: string;
  unit_cost_krw: number;
}

export default function WasteView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [totalWasteKrw, setTotalWasteKrw] = useState<number>(0);
  const [totalLogsCount, setTotalLogsCount] = useState<number>(0);
  const [byReasonKrw, setByReasonKrw] = useState<Record<string, number>>({});
  const [recentLogs, setRecentLogs] = useState<WasteLogRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form state
  const [ingredientId, setIngredientId] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(0.5);
  const [reason, setReason] = useState<string>('expired');
  const [notes, setNotes] = useState<string>('소비기한 임박/경과 검수 폐기');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const fetchWasteData = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/waste?limit=40').then(r => r.json()),
      fetch('/api/ingredients').then(r => r.json()),
    ])
      .then(([wData, ingData]) => {
        setTotalWasteKrw(wData.total_waste_krw || 0);
        setTotalLogsCount(wData.total_logs_count || 0);
        setByReasonKrw(wData.by_reason_krw || {});
        setRecentLogs(wData.recent_logs || []);
        setIngredients(Array.isArray(ingData) ? ingData : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchWasteData();
  }, []);

  const handleCreateWaste = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/api/waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: Number(ingredientId),
        quantity: Number(quantity),
        reason,
        notes,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setSavedMsg(
          isKo
            ? `폐기 등록 완료: ${data.ingredient_name_ko} ${data.quantity}${data.unit} (손실액 ₩${data.cost_krw.toLocaleString()}) — FEFO 로트 차감 및 감사로그 기록됨`
            : `Waste logged: ${data.ingredient_name_en} ${data.quantity} ${data.unit} (₩${data.cost_krw.toLocaleString()}) — FEFO depleted & audited`
        );
        fetchWasteData();
      })
      .catch(err => console.error(err));
  };

  const reasonLabel = (r: string) => {
    switch (r) {
      case 'expired':
        return isKo ? '소비기한 만료 (Expired)' : '소비기한 Expired';
      case 'spoiled':
        return isKo ? '변질/품질저하 (Spoiled)' : 'Spoiled';
      case 'over_prepared':
        return isKo ? '과잉 조리/잔반 (Over-prep)' : 'Over-prepared';
      case 'dropped':
        return isKo ? '조리실수/파손 (Dropped)' : 'Dropped / Spill';
      default:
        return r;
    }
  };

  const selectedIng = ingredients.find(i => i.id === ingredientId);
  const previewCost = Math.round((selectedIng?.unit_cost_krw || 0) * Number(quantity));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {isKo ? '식자재 폐기 등록 및 손실 분석' : 'Ingredient Waste Log & Loss Analytics'}
        </h2>
        <p className="text-sm text-gray-500">
          {isKo
            ? '폐기 등록 시 소비기한이 가장 빠른 활성 로트(FEFO)에서 자동 차감되며 감사 로그에 기록됩니다.'
            : 'Logging waste automatically depletes the earliest-expiring active lot (FEFO) and writes to the Audit Log.'}
        </p>
      </div>

      {/* Summary Cards by Reason */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <p className="text-xs text-red-700 font-semibold">{isKo ? '누적 총 폐기 손실액' : 'Total Logged Waste'}</p>
          <p className="text-xl font-bold text-red-600 mt-1">₩{totalWasteKrw.toLocaleString()}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {isKo ? `총 ${totalLogsCount}건 기록` : `${totalLogsCount} total events`}
          </p>
        </div>
        {(['expired', 'spoiled', 'over_prepared', 'dropped'] as const).map(key => (
          <div key={key} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 font-medium">{reasonLabel(key)}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              ₩{(byReasonKrw[key] || 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Log New Waste Form + Recent Waste Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-800 text-sm flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-red-600" />
            <span>{isKo ? '신규 폐기 발생 등록' : 'Record New Waste Event'}</span>
          </h3>

          <form onSubmit={handleCreateWaste} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '폐기 식자재 선택' : 'Select Ingredient'}
              </label>
              <select
                value={ingredientId}
                onChange={e => setIngredientId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
              >
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isKo ? `폐기 수량 (${selectedIng?.unit || 'kg'})` : `Waste Qty (${selectedIng?.unit || 'kg'})`}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold"
                />
              </div>
              <div className="p-2.5 bg-red-50 rounded-lg border border-red-200">
                <span className="text-[11px] text-red-700 block">{isKo ? '추정 손실 원가' : 'Est. Loss Value'}</span>
                <span className="text-sm font-bold text-red-800">₩{previewCost.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '폐기 사유' : 'Waste Reason'}
              </label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
              >
                <option value="expired">{isKo ? '소비기한 만료 (Expired)' : '소비기한 Expired'}</option>
                <option value="spoiled">{isKo ? '변질 / 품질저하 (Spoiled)' : 'Spoiled'}</option>
                <option value="over_prepared">{isKo ? '과잉 조리 / 잔반 (Over-prepared)' : 'Over-prepared'}</option>
                <option value="dropped">{isKo ? '조리 실수 / 낙하 (Dropped)' : 'Dropped / Spill'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '상세 메모' : 'Notes'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center justify-center space-x-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isKo ? '폐기 등록 및 FEFO 재고 차감' : 'Record Waste & Deplete FEFO'}</span>
            </button>

            {savedMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{savedMsg}</span>
              </div>
            )}
          </form>
        </div>

        {/* Right: Recent Waste Logs Table */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 text-sm">
              {isKo ? '최근 폐기 이력 (최신순)' : 'Recent Waste Log History'}
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {isKo ? '폐기 이력 불러오는 중...' : 'Loading waste logs...'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200 sticky top-0">
                    <th className="py-3 px-4">{isKo ? '일시' : 'Date'}</th>
                    <th className="py-3 px-4">{isKo ? '식자재' : 'Ingredient'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '폐기 수량' : 'Qty'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '손실 금액' : 'Loss ₩'}</th>
                    <th className="py-3 px-4">{isKo ? '사유' : 'Reason'}</th>
                    <th className="py-3 px-4">{isKo ? '메모' : 'Notes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentLogs.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-500">
                        {row.log_datetime.substring(0, 10)}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900 text-xs">
                        {isKo ? row.ingredient_name_ko : row.ingredient_name_en}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-red-700">
                        {row.quantity} {row.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-medium text-gray-800">
                        ₩{row.cost_krw.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                          {reasonLabel(row.reason)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
