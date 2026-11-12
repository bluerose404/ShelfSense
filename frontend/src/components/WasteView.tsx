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
            ? `폐기 등록 완료: ${data.ingredient_name_ko} ${data.quantity} ${data.unit} (손실액 ₩${data.cost_krw.toLocaleString()}) — FEFO 로트 차감 및 감사 로그 기록됨`
            : `Waste logged: ${data.ingredient_name_en} ${data.quantity} ${data.unit} (₩${data.cost_krw.toLocaleString()}) — FEFO depleted & audited`
        );
        fetchWasteData();
      })
      .catch(err => console.error(err));
  };

  const reasonLabel = (r: string) => {
    switch (r) {
      case 'expired':
        return isKo ? '소비기한 만료 (Expired)' : '소비기한 expired';
      case 'spoiled':
        return isKo ? '변질/품질저하 (Spoiled)' : 'Spoiled';
      case 'over_prepared':
        return isKo ? '과잉 조리/잔반 (Over-prep)' : 'Over-prepared';
      case 'dropped':
        return isKo ? '조리실수/파손 (Dropped)' : 'Dropped / spill';
      default:
        return r;
    }
  };

  const selectedIng = ingredients.find(i => i.id === ingredientId);
  const previewCost = Math.round((selectedIng?.unit_cost_krw || 0) * Number(quantity));

  return (
    <div>
      <h1 className="ss-page-title">
        {isKo ? '식자재 폐기 기록 및 손실 분석' : 'Ingredient waste log & loss analysis'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? '폐기 등록 시 소비기한이 가장 빠른 활성 로트(FEFO)에서 자동 차감되며 감사 로그에 기록됩니다.'
          : 'Logging waste automatically depletes the earliest-expiring active lot (FEFO) and records an audit entry.'}
      </p>

      {/* Summary Shelf-Label Tiles by Reason */}
      <section className="ss-section">
        <h2 className="ss-section-title">
          {isKo ? '폐기 손실 요약' : 'Waste loss summary'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="ss-tile ss-tile-critical">
            <div className="ss-figure">₩{totalWasteKrw.toLocaleString()}</div>
            <div className="ss-figure-label">{isKo ? '누적 총 폐기 손실액' : 'Total logged waste'}</div>
            <p className="text-xs text-paper/80 mt-2 tabular-nums">
              {isKo ? `총 ${totalLogsCount}건 기록` : `${totalLogsCount} total events`}
            </p>
          </div>
          {(['expired', 'spoiled', 'over_prepared', 'dropped'] as const).map(key => (
            <div key={key} className="ss-tile">
              <div className="ss-figure">₩{(byReasonKrw[key] || 0).toLocaleString()}</div>
              <div className="ss-figure-label">{reasonLabel(key)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Log New Waste Form + Recent Waste Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-4 ss-section">
          <h2 className="ss-section-title">
            <PlusCircle className="w-5 h-5" aria-hidden="true" />
            <span>{isKo ? '신규 폐기 기록' : 'Log waste'}</span>
          </h2>

          <form onSubmit={handleCreateWaste} className="space-y-4">
            <div>
              <label className="ss-label">
                {isKo ? '폐기 식자재' : 'Ingredient'}
              </label>
              <select
                value={ingredientId}
                onChange={e => setIngredientId(Number(e.target.value))}
                className="ss-input w-full"
              >
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="ss-label">
                  {isKo ? `폐기 수량 (${selectedIng?.unit || 'kg'})` : `Quantity (${selectedIng?.unit || 'kg'})`}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                  className="ss-input w-full font-bold tabular-nums"
                />
              </div>
              <div className="ss-tile p-2.5">
                <span className="ss-meta block">{isKo ? '추정 손실 원가' : 'Estimated loss'}</span>
                <span className="text-base font-bold tabular-nums">₩{previewCost.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="ss-label">
                {isKo ? '폐기 사유' : 'Reason'}
              </label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="ss-input w-full"
              >
                <option value="expired">{isKo ? '소비기한 만료 (Expired)' : '소비기한 expired'}</option>
                <option value="spoiled">{isKo ? '변질 / 품질저하 (Spoiled)' : 'Spoiled'}</option>
                <option value="over_prepared">{isKo ? '과잉 조리 / 잔반 (Over-prep)' : 'Over-prepared'}</option>
                <option value="dropped">{isKo ? '조리 실수 / 낙하 (Dropped)' : 'Dropped / spill'}</option>
              </select>
            </div>

            <div>
              <label className="ss-label">
                {isKo ? '상세 메모' : 'Notes'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="ss-input w-full"
              />
            </div>

            <button
              type="submit"
              className="ss-btn ss-btn-primary w-full"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>{isKo ? '폐기 기록 (FEFO 차감)' : 'Log waste'}</span>
            </button>

            {savedMsg && (
              <div className="ss-note ss-note-attention">
                <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
                <span>{savedMsg}</span>
              </div>
            )}
          </form>
        </section>

        {/* Right: Recent Waste Logs Table */}
        <section className="lg:col-span-8 ss-section">
          <h2 className="ss-section-title">
            {isKo ? '최근 폐기 이력 (최신순)' : 'Recent waste history'}
          </h2>

          {loading ? (
            <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
              {isKo ? '폐기 이력 불러오는 중...' : 'Loading waste logs...'}
            </div>
          ) : (
            <div className="ss-table-wrap max-h-[520px]">
              <table className="ss-table">
                <thead>
                  <tr>
                    <th>{isKo ? '일시' : 'Date'}</th>
                    <th>{isKo ? '식자재' : 'Ingredient'}</th>
                    <th className="ss-num">{isKo ? '폐기 수량' : 'Quantity'}</th>
                    <th className="ss-num">{isKo ? '손실 금액' : 'Loss (₩)'}</th>
                    <th>{isKo ? '사유' : 'Reason'}</th>
                    <th>{isKo ? '메모' : 'Notes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map(row => (
                    <tr key={row.id} className={row.reason === 'expired' ? 'ss-row-critical' : ''}>
                      <td className="tabular-nums ss-muted whitespace-nowrap">
                        {row.log_datetime.substring(0, 10)}
                      </td>
                      <td className="font-bold whitespace-nowrap">
                        {isKo ? row.ingredient_name_ko : row.ingredient_name_en}
                      </td>
                      <td className="ss-num font-bold">
                        {row.quantity} {row.unit}
                      </td>
                      <td className="ss-num">
                        ₩{row.cost_krw.toLocaleString()}
                      </td>
                      <td>
                        <span className={`ss-chip ${row.reason === 'expired' ? 'ss-chip-critical' : 'ss-chip-ok'}`}>
                          {reasonLabel(row.reason)}
                        </span>
                      </td>
                      <td className="ss-muted">{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
