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
            ? '시스템 설정이 저장되었으며 감사 로그(Audit Log)에 기록되었습니다.'
            : 'System settings saved and recorded in the immutable Audit Log.'
        );
        fetchSettingsAndAudit();
      })
      .catch(err => console.error(err));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {isKo ? '시스템 설정 & 불변 감사 로그 (Audit Log)' : 'System Settings & Immutable Audit Log'}
        </h2>
        <p className="text-sm text-gray-500">
          {isKo
            ? '자율성 수준(1~2단계), 발주 버퍼 및 예산 한도, 근로기준법 파라미터 설정과 모든 의사결정 감사 이력을 조회합니다.'
            : 'Configure human-in-the-loop autonomy (Levels 1–2), order guardrails, Korean labor parameters, and inspect the audit trail.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: System Configuration Form */}
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-5 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4"
        >
          <div className="flex items-center space-x-2 pb-2 border-b border-gray-100">
            <Settings className="w-4 h-4 text-teal-700" />
            <h3 className="font-bold text-gray-800 text-sm">
              {isKo ? '운영 정책 및 가드레일 설정' : 'Operating Policy & Guardrail Settings'}
            </h3>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-xs">
            <span className="text-gray-600 font-medium">
              {isKo ? '시뮬레이션 데모 시계 (고정 기준점):' : 'Simulated Demo Clock (Fixed Anchor):'}
            </span>
            <span className="font-mono font-bold text-teal-800">{demoClock} (Wed)</span>
          </div>

          {/* Autonomy Level Selector with Level 3 Disabled */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">
              {isKo ? '발주 자율성 단계 (Human-in-the-Loop)' : 'Ordering Autonomy Level'}
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAutonomyLevel(1)}
                className={`w-full p-2.5 rounded-lg border text-left text-xs transition ${
                  autonomyLevel === 1
                    ? 'border-[#078B79] bg-teal-50/70 font-bold text-teal-900'
                    : 'border-gray-200 text-gray-700'
                }`}
              >
                {isKo ? 'Level 1: 개별 제안 및 검토 (Suggest Only)' : 'Level 1: Suggest Only'}
              </button>
              <button
                type="button"
                onClick={() => setAutonomyLevel(2)}
                className={`w-full p-2.5 rounded-lg border text-left text-xs transition ${
                  autonomyLevel === 2
                    ? 'border-[#078B79] bg-teal-50/70 font-bold text-teal-900'
                    : 'border-gray-200 text-gray-700'
                }`}
              >
                {isKo ? 'Level 2: 원탭 일괄 승인 (One-Tap Approve)' : 'Level 2: One-Tap Approve'}
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-400 text-left text-xs cursor-not-allowed flex items-center justify-between"
              >
                <span>
                  {isKo
                    ? 'Level 3: 완전 자동 발주 (사장님 승인 필수 원칙으로 비활성화)'
                    : 'Level 3: Full Auto-Order (Disabled by human-in-the-loop rule)'}
                </span>
                <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '기본 안전 버퍼 (%)' : 'Safety Buffer (%)'}
              </label>
              <input
                type="number"
                value={bufferPct}
                onChange={e => setBufferPct(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '단가 급등 경고 기준 (%)' : 'Price Surge Flag (%)'}
              </label>
              <input
                type="number"
                value={priceFlagPct}
                onChange={e => setPriceFlagPct(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '1회 발주 금액 상한 (₩)' : 'Order Spend Cap (₩)'}
              </label>
              <input
                type="number"
                step="50000"
                value={spendCapKrw}
                onChange={e => setSpendCapKrw(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '목표 인건비 비율 (%)' : 'Target Labor Cost (%)'}
              </label>
              <input
                type="number"
                value={targetLaborPct}
                onChange={e => setTargetLaborPct(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '적용 최저임금 (₩/hr)' : 'Minimum Wage (₩/hr)'}
              </label>
              <input
                type="number"
                value={minWageKrw}
                onChange={e => setMinWageKrw(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div className="flex space-x-1.5">
              <button
                type="button"
                onClick={() => setMinWageKrw(10320)}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-[11px] font-semibold text-gray-700"
              >
                2026 (₩10,320)
              </button>
              <button
                type="button"
                onClick={() => setMinWageKrw(10700)}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-[11px] font-semibold text-gray-700"
              >
                2027 (₩10,700)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-xs font-semibold text-gray-700">
              {isKo ? '5인 이상 사업장 연장·야간·휴일 가산수당(1.5x)' : '5+ Employees Overtime/Night/Holiday 1.5x'}
            </span>
            <input
              type="checkbox"
              checked={has5Plus}
              onChange={e => setHas5Plus(e.target.checked)}
              className="w-4 h-4 accent-[#078B79]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition shadow-sm"
          >
            {isKo ? '설정 저장 및 감사로그 기록' : 'Save Settings & Write Audit Log'}
          </button>

          {savedBanner && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{savedBanner}</span>
            </div>
          )}
        </form>

        {/* Right: Immutable Audit Log Viewer */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-teal-700" />
              <h3 className="font-bold text-gray-800 text-sm">
                {isKo ? '감사 로그 뷰어 (Audit Trail)' : 'Immutable Audit Log Viewer'}
              </h3>
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={actionFilter}
                onChange={e => {
                  setActionFilter(e.target.value);
                  fetchSettingsAndAudit(e.target.value);
                }}
                className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs bg-white"
              >
                <option value="all">{isKo ? '전체 액션' : 'All Actions'}</option>
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
                className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p>
                {isKo
                  ? '기록된 감사 로그가 없습니다. 발주 승인, 바코드 입고, 실사 조정, 설정 변경 시 즉시 기록됩니다.'
                  : 'No audit log entries yet. Actions such as order approvals, barcode receiving, spot counts, and setting changes appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase border-b border-gray-200 sticky top-0">
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">{isKo ? '액션' : 'Action'}</th>
                    <th className="py-2.5 px-3">{isKo ? '대상 엔티티' : 'Entity'}</th>
                    <th className="py-2.5 px-3">{isKo ? '상세 내역 (JSON)' : 'Details (JSON)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-mono text-gray-500">#{log.id}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono font-semibold">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-700">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id})` : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600 break-all">
                        {log.details_json}
                      </td>
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
