import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Shield, Lock, CheckCircle2, History, RefreshCw } from 'lucide-react';

export interface AuditLogItem {
  id: number;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details_json: string;
}

export default function SettingsAuditView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [demoClock, setDemoClock] = useState('2026-11-04 09:00:00');
  const [autonomyLevel, setAutonomyLevel] = useState<number>(2);
  const [bufferPct, setBufferPct] = useState<number>(10);
  const [spendCapKrw, setSpendCapKrw] = useState<number>(1000000);
  const [priceFlagPct, setPriceFlagPct] = useState<number>(10);
  const [targetLaborPct, setTargetLaborPct] = useState<number>(30);
  const [minWageKrw, setMinWageKrw] = useState<number>(10320);
  const [has5Plus, setHas5Plus] = useState<boolean>(true);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchSettingsAndAudit = (filterVal: string = actionFilter) => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch(`/api/audit-logs?limit=50&action=${filterVal}`).then(r => r.json()),
    ])
      .then(([sData, aData]) => {
        if (sData) {
          setDemoClock(sData.demo_clock || '2026-11-04 09:00:00');
          setAutonomyLevel(Number(sData.autonomy_level || 2));
          setBufferPct(Number(sData.buffer_pct || 10));
          setSpendCapKrw(Number(sData.spend_cap_krw || 1000000));
          setPriceFlagPct(Number(sData.price_flag_pct || 10));
          setTargetLaborPct(Number(sData.target_labor_pct || 30));
          setMinWageKrw(Number(sData.min_wage_krw || 10320));
          setHas5Plus(String(sData.has_5_plus_employees).toLowerCase() === 'true');
        }
        setAuditLogs(Array.isArray(aData) ? aData : []);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchSettingsAndAudit();
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          autonomy_level: autonomyLevel,
          buffer_pct: bufferPct,
          spend_cap_krw: spendCapKrw,
          price_flag_pct: priceFlagPct,
          target_labor_pct: targetLaborPct,
          min_wage_krw: minWageKrw,
          has_5_plus_employees: has5Plus,
        },
      }),
    })
      .then(r => r.json())
      .then(() => {
        setSavedBanner(
          isKo
            ? '설정이 저장되었으며 감사 로그에 기록되었습니다.'
            : 'Settings saved and recorded in the audit log.'
        );
        fetchSettingsAndAudit();
      })
      .catch(err => console.error(err));
  };

  return (
    <div>
      <h1 className="ss-page-title">
        {isKo ? '시스템 설정 & 감사 로그 (Audit log)' : 'Settings & audit log'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? '자율성 수준(1~2단계), 발주 버퍼 및 예산 한도, 근로기준법 파라미터 설정과 모든 의사결정 감사 이력을 조회합니다.'
          : 'Configure human-in-the-loop autonomy (Levels 1–2), order guardrails, Korean labor parameters, and inspect the audit trail.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: System Configuration Form */}
        <section className="lg:col-span-5 ss-section">
          <h2 className="ss-section-title">
            <Settings className="w-5 h-5" aria-hidden="true" />
            <span>{isKo ? '운영 정책 및 가드레일 설정' : 'Operating policy & guardrails'}</span>
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="ss-note justify-between">
              <span className="text-xs ss-muted">
                {isKo ? '시뮬레이션 데모 시계 (고정 기준점):' : 'Simulated demo clock (fixed anchor):'}
              </span>
              <span className="font-bold text-xs tabular-nums">{demoClock} (Wed)</span>
            </div>

            {/* Autonomy Level Selector with Level 3 Disabled */}
            <div className="space-y-2">
              <label className="ss-label">
                {isKo ? '발주 자율성 단계 (Human-in-the-loop)' : 'Ordering autonomy level'}
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAutonomyLevel(1)}
                  className={`w-full p-3 border text-left text-xs cursor-pointer ${
                    autonomyLevel === 1
                      ? 'bg-ink text-paper border-ink font-bold'
                      : 'bg-paper text-ink border-ink/35 hover:bg-ink/5'
                  }`}
                >
                  {isKo ? 'Level 1: 개별 제안 및 검토 (Suggest only)' : 'Level 1: Suggest only'}
                </button>
                <button
                  type="button"
                  onClick={() => setAutonomyLevel(2)}
                  className={`w-full p-3 border text-left text-xs cursor-pointer ${
                    autonomyLevel === 2
                      ? 'bg-ink text-paper border-ink font-bold'
                      : 'bg-paper text-ink border-ink/35 hover:bg-ink/5'
                  }`}
                >
                  {isKo ? 'Level 2: 원탭 일괄 승인 (One-tap approve)' : 'Level 2: One-tap approve'}
                </button>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="w-full p-3 border border-dashed border-ink/35 bg-paper text-ink/35 text-left text-xs cursor-not-allowed flex items-center justify-between gap-2"
                >
                  <span>
                    {isKo
                      ? 'Level 3: 완전 자동 발주 (사장님 승인 필수 원칙으로 비활성화)'
                      : 'Level 3: Full auto-order (disabled by human-in-the-loop rule)'}
                  </span>
                  <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ss-label">
                  {isKo ? '기본 안전 버퍼 (%)' : 'Safety buffer (%)'}
                </label>
                <input
                  type="number"
                  value={bufferPct}
                  onChange={e => setBufferPct(Number(e.target.value))}
                  className="ss-input w-full tabular-nums"
                />
              </div>
              <div>
                <label className="ss-label">
                  {isKo ? '단가 급등 경고 기준 (%)' : 'Price surge flag (%)'}
                </label>
                <input
                  type="number"
                  value={priceFlagPct}
                  onChange={e => setPriceFlagPct(Number(e.target.value))}
                  className="ss-input w-full tabular-nums"
                />
              </div>
              <div>
                <label className="ss-label">
                  {isKo ? '1회 발주 금액 상한 (₩)' : 'Order spend cap (₩)'}
                </label>
                <input
                  type="number"
                  step="50000"
                  value={spendCapKrw}
                  onChange={e => setSpendCapKrw(Number(e.target.value))}
                  className="ss-input w-full tabular-nums"
                />
              </div>
              <div>
                <label className="ss-label">
                  {isKo ? '목표 인건비 비율 (%)' : 'Target labor cost (%)'}
                </label>
                <input
                  type="number"
                  value={targetLaborPct}
                  onChange={e => setTargetLaborPct(Number(e.target.value))}
                  className="ss-input w-full tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="ss-label">
                  {isKo ? '적용 최저임금 (₩/hr)' : 'Minimum wage (₩/hr)'}
                </label>
                <input
                  type="number"
                  value={minWageKrw}
                  onChange={e => setMinWageKrw(Number(e.target.value))}
                  className="ss-input w-full tabular-nums"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMinWageKrw(10320)}
                  className="ss-btn ss-btn-secondary ss-btn-sm"
                >
                  2026 (₩10,320)
                </button>
                <button
                  type="button"
                  onClick={() => setMinWageKrw(10700)}
                  className="ss-btn ss-btn-secondary ss-btn-sm"
                >
                  2027 (₩10,700)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border border-ink/35">
              <span className="text-xs font-bold">
                {isKo ? '5인 이상 사업장 연장·야간·휴일 가산수당 (1.5×)' : '5+ employees overtime/night/holiday 1.5×'}
              </span>
              <input
                type="checkbox"
                checked={has5Plus}
                onChange={e => setHas5Plus(e.target.checked)}
                className="w-4 h-4 accent-[#04225c]"
              />
            </div>

            <button
              type="submit"
              className="ss-btn ss-btn-primary w-full"
            >
              {isKo ? '변경사항 저장' : 'Save changes'}
            </button>

            {savedBanner && (
              <div className="ss-note ss-note-attention">
                <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
                <span>{savedBanner}</span>
              </div>
            )}
          </form>
        </section>

        {/* Right: Immutable Audit Log Viewer */}
        <section className="lg:col-span-7 ss-section">
          <div className="ss-section-title justify-between flex-wrap">
            <span className="inline-flex items-center gap-2">
              <History className="w-5 h-5" aria-hidden="true" />
              <span>{isKo ? '감사 로그 (Audit trail)' : 'Audit log'}</span>
            </span>

            <div className="flex items-center gap-2 font-normal">
              <select
                value={actionFilter}
                onChange={e => {
                  setActionFilter(e.target.value);
                  fetchSettingsAndAudit(e.target.value);
                }}
                className="ss-input text-xs min-h-[32px]"
              >
                <option value="all">{isKo ? '전체 액션' : 'All actions'}</option>
                <option value="order_approved">order_approved</option>
                <option value="order_edited">order_edited</option>
                <option value="order_rejected">order_rejected</option>
                <option value="scan_received">scan_received</option>
                <option value="count_adjusted">count_adjusted</option>
                <option value="waste_logged">waste_logged</option>
                <option value="setting_changed">setting_changed</option>
              </select>
              <button
                type="button"
                onClick={() => fetchSettingsAndAudit(actionFilter)}
                className="ss-btn ss-btn-secondary ss-btn-sm"
                aria-label={isKo ? '새로고침' : 'Refresh'}
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
              <p>
                {isKo
                  ? '기록된 감사 로그가 없습니다. 발주 승인, 바코드 입고, 실사 조정, 설정 변경 시 즉시 기록됩니다.'
                  : 'No audit log entries yet. Order approvals, barcode receiving, spot counts, and setting changes appear here.'}
              </p>
            </div>
          ) : (
            <div className="ss-table-wrap max-h-[540px]">
              <table className="ss-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{isKo ? '액션' : 'Action'}</th>
                    <th>{isKo ? '대상 엔티티' : 'Entity'}</th>
                    <th>{isKo ? '상세 내역 (JSON)' : 'Details (JSON)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td className="tabular-nums ss-muted">#{log.id}</td>
                      <td>
                        <span className="ss-chip ss-chip-info">
                          {log.action}
                        </span>
                      </td>
                      <td className="font-bold whitespace-nowrap">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id})` : ''}
                      </td>
                      <td className="text-xs ss-muted break-all tabular-nums">
                        {log.details_json}
                      </td>
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
