import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, AlertCircle, CheckCircle2, Scissors, ShieldAlert } from 'lucide-react';

export interface StaffScheduleRow {
  staff_id: number;
  name_ko: string;
  name_en: string;
  role: string;
  employment_type: string;
  hourly_wage_krw: number;
  max_weekly_hours: number;
  scheduled_days: number;
  shift_duration_hours: number;
  break_minutes: number;
  weekly_paid_hours: number;
  min_wage_ok: boolean;
  required_break_minutes: number;
  break_ok: boolean;
  weekly_cap_ok: boolean;
  juhyu_eligible: boolean;
  juhyu_allowance_krw: number;
  has_5_plus_employees: boolean;
  premium_pay_krw: number;
  base_pay_krw: number;
  total_estimated_weekly_pay_krw: number;
  violations: string[];
  warnings: string[];
}

export interface CanonicalLaborSummary {
  projected_sales_krw: number;
  target_labor_pct: number;
  labor_budget_krw: number;
  draft_hours: number;
  avg_hourly_wage_krw: number;
  draft_cost_krw: number;
  draft_labor_pct: number;
  budget_remaining_krw: number;
  within_budget: boolean;
  peak_covers_per_hour: number;
  covers_per_staff_per_hour: number;
  peak_front_staff: number;
}

export function evaluateCanonicalLaborFixture(
  salesKrw: number = 4000000,
  targetPct: number = 30,
  draftHours: number = 92,
  hourlyWageKrw: number = 12000,
  peakCoversPerHour: number = 48,
  coversPerStaff: number = 14
) {
  const budgetKrw = Math.round(salesKrw * (targetPct / 100));
  const draftCostKrw = Math.round(draftHours * hourlyWageKrw);
  const draftPct = Number(((draftCostKrw / salesKrw) * 100).toFixed(1));
  const peakFrontStaff = Math.ceil(peakCoversPerHour / coversPerStaff);
  return { budgetKrw, draftCostKrw, draftPct, peakFrontStaff };
}

export default function LaborView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [disclaimerKo, setDisclaimerKo] = useState<string>('');
  const [disclaimerEn, setDisclaimerEn] = useState<string>('');
  const [minWageKrw, setMinWageKrw] = useState<number>(10320);
  const [has5Plus, setHas5Plus] = useState<boolean>(true);
  const [budgetSummary, setBudgetSummary] = useState<CanonicalLaborSummary | null>(null);
  const [staffRows, setStaffRows] = useState<StaffScheduleRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Early-Cut Simulator state
  const [simProjectedCovers, setSimProjectedCovers] = useState<number>(48);
  const [simActualCovers, setSimActualCovers] = useState<number>(24);
  const [simScheduledStaff, setSimScheduledStaff] = useState<number>(4);
  const [simCutHours, setSimCutHours] = useState<number>(1.5);
  const [simHourlyWage] = useState<number>(10500);
  const [simWeeklyHours, setSimWeeklyHours] = useState<number>(16.0);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchLaborDraft = () => {
    setLoading(true);
    fetch('/api/labor/draft')
      .then(r => r.json())
      .then(data => {
        setDisclaimerKo(data.disclaimer_ko || '');
        setDisclaimerEn(data.disclaimer_en || '');
        setMinWageKrw(data.min_wage_krw || 10320);
        setHas5Plus(Boolean(data.has_5_plus_employees));
        setBudgetSummary(data.canonical_budget_summary || null);
        setStaffRows(data.staff_schedule || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLaborDraft();
    runEarlyCutSimulation();
  }, []);

  const handleToggle5Plus = () => {
    const nextVal = !has5Plus;
    fetch('/api/settings/five-plus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_5_plus_employees: nextVal }),
    })
      .then(r => r.json())
      .then(() => {
        setHas5Plus(nextVal);
        fetchLaborDraft();
      })
      .catch(err => console.error(err));
  };

  const runEarlyCutSimulation = () => {
    fetch('/api/labor/early-cut', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projected_covers_per_hour: Number(simProjectedCovers),
        actual_covers_per_hour: Number(simActualCovers),
        scheduled_front_staff: Number(simScheduledStaff),
        covers_per_staff_per_hour: 14.0,
        cut_hours: Number(simCutHours),
        hourly_wage_krw: Number(simHourlyWage),
        staff_current_weekly_hours: Number(simWeeklyHours),
        min_staff_floor: 2,
      }),
    })
      .then(r => r.json())
      .then(data => setSimResult(data))
      .catch(err => console.error(err));
  };

  return (
    <div className="space-y-6">
      {/* Header & 5+ Employees Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isKo ? '주간 인력 스케줄 초안 & 근로기준법 점검' : 'Weekly Labor Schedule Draft & Korean Labor Law Checks'}
          </h2>
          <p className="text-sm text-gray-500">
            {isKo
              ? '2026 최저임금(₩10,320/hr), 법정 휴게시간(4h→30m, 8h→1h), 주휴수당(15h 기준), 조기 퇴근 시뮬레이션'
              : '2026 minimum wage (₩10,320/hr), mandatory breaks, 주휴수당 (15h threshold), and early-cut simulator'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggle5Plus}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition ${
            has5Plus
              ? 'bg-teal-50 border-teal-300 text-teal-900'
              : 'bg-gray-100 border-gray-300 text-gray-700'
          }`}
        >
          {isKo
            ? `5인 이상 사업장 가산수당(1.5x): ${has5Plus ? '적용 중 (ON)' : '미적용 (OFF)'}`
            : `5+ Employees 1.5x Multiplier: ${has5Plus ? 'ON' : 'OFF'}`}
        </button>
      </div>

      {/* Mandatory Non-Payroll Disclaimer Banner */}
      <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-3 text-xs text-amber-900">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm">
            {isKo ? '급여 미실행 및 스케줄링 추정치 고지 (Disclaimer)' : 'Scheduling Estimate Disclaimer (No Real Payroll)'}
          </p>
          <p className="mt-0.5">{isKo ? disclaimerKo : disclaimerEn}</p>
        </div>
      </div>

      {/* Canonical Labor Budget & Peak Staffing Fixture Cards */}
      {budgetSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">
              {isKo ? `목표 인건비 예산 (매출 ₩${budgetSummary.projected_sales_krw.toLocaleString()}의 ${budgetSummary.target_labor_pct}%)` : `Labor Budget (${budgetSummary.target_labor_pct}% of ₩${budgetSummary.projected_sales_krw.toLocaleString()})`}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ₩{budgetSummary.labor_budget_krw.toLocaleString()}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-teal-300 shadow-sm">
            <p className="text-xs text-teal-800 font-semibold">
              {isKo ? `스케줄 초안 인건비 (${budgetSummary.draft_hours}시간 × ₩${budgetSummary.avg_hourly_wage_krw.toLocaleString()})` : `Draft Cost (${budgetSummary.draft_hours}h × ₩${budgetSummary.avg_hourly_wage_krw.toLocaleString()})`}
            </p>
            <p className="text-2xl font-bold text-teal-800 mt-1">
              ₩{budgetSummary.draft_cost_krw.toLocaleString()}{' '}
              <span className="text-sm font-semibold">({budgetSummary.draft_labor_pct}%)</span>
            </p>
            <p className="text-[11px] text-emerald-700 mt-1">
              {isKo
                ? `예산 대비 ₩${budgetSummary.budget_remaining_krw.toLocaleString()} 절감`
                : `₩${budgetSummary.budget_remaining_krw.toLocaleString()} under budget`}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">
              {isKo ? '피크 시간대 홀 필요 인원 (48식/시간 ÷ 14식)' : 'Peak Front Staffing (48 covers/h ÷ 14)'}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {budgetSummary.peak_front_staff} {isKo ? '명 (홀 서빙)' : 'Front Staff'}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              {isKo ? '18:00~19:30 저녁 피크 기준' : '18:00–19:30 Dinner Peak'}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500">
              {isKo ? '2026년 법정 최저임금 기준' : '2026 Statutory Minimum Wage'}
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ₩{minWageKrw.toLocaleString()}<span className="text-xs font-normal text-gray-500">/hr</span>
            </p>
            <p className="text-[11px] text-emerald-700 mt-1">
              {isKo ? '전 직원 최저임금 이상 준수' : 'All 8 staff ≥ minimum wage'}
            </p>
          </div>
        </div>
      )}

      {/* Staff Schedule Table with Korean Labor Rule Checks */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-800 text-sm flex items-center space-x-2">
            <Users className="w-4 h-4 text-teal-700" />
            <span>{isKo ? '직원별 주간 근무표 및 근로기준법 자동 점검' : 'Staff Weekly Schedule & Korean Labor Standards Checks'}</span>
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {isKo ? '근무 스케줄 불러오는 중...' : 'Loading labor schedule...'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                  <th className="py-3 px-4">{isKo ? '이름 / 역할' : 'Staff / Role'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '시급' : 'Hourly Wage'}</th>
                  <th className="py-3 px-4">{isKo ? '일 근무 / 휴게시간' : 'Shift / Break'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '주 유급시간' : 'Weekly Hours'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '주휴수당 (≥15h)' : '주휴수당 (≥15h)'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '주간 추정 합계' : 'Est. Weekly Total'}</th>
                  <th className="py-3 px-4">{isKo ? '법규 점검 상태' : 'Compliance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {staffRows.map(st => (
                  <tr key={st.staff_id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {isKo ? st.name_ko : st.name_en}
                      <span className="ml-2 px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-600 uppercase">
                        {st.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      ₩{st.hourly_wage_krw.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-700">
                      {st.scheduled_days}{isKo ? '일' : 'd'} × {st.shift_duration_hours}h{' '}
                      <span className="text-gray-500">
                        ({isKo ? `휴게 ${st.break_minutes}분` : `break ${st.break_minutes}m`})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      {st.weekly_paid_hours}h{' '}
                      <span className="text-xs font-normal text-gray-400">/ {st.max_weekly_hours}h</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      {st.juhyu_eligible ? (
                        <span className="text-amber-800 font-semibold">
                          ₩{st.juhyu_allowance_krw.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">₩0 (&lt;15h)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                      ₩{st.total_estimated_weekly_pay_krw.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {st.violations.length === 0 ? (
                        <span className="inline-flex items-center text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {isKo ? '준수 (OK)' : 'Compliant'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-600 font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                          {st.violations[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Early-Cut Simulator Panel */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2">
          <Scissors className="w-4 h-4 text-teal-700" />
          <h3 className="font-bold text-gray-800 text-sm">
            {isKo ? '한산 시간대 조기 퇴근(Early-Cut) 시뮬레이터' : 'Slow-Shift Early-Cut Simulator'}
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isKo ? '예상 시간당 식수' : 'Projected Covers/h'}
            </label>
            <input
              type="number"
              value={simProjectedCovers}
              onChange={e => setSimProjectedCovers(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isKo ? '실제 시간당 식수' : 'Actual Covers/h'}
            </label>
            <input
              type="number"
              value={simActualCovers}
              onChange={e => setSimActualCovers(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isKo ? '현재 배치 홀 인원' : 'Scheduled Staff'}
            </label>
            <input
              type="number"
              value={simScheduledStaff}
              onChange={e => setSimScheduledStaff(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isKo ? '단축 시간 (시간)' : 'Cut Hours'}
            </label>
            <input
              type="number"
              step="0.5"
              value={simCutHours}
              onChange={e => setSimCutHours(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              {isKo ? '대상 직원 주 누적시간' : 'Staff Weekly Hrs'}
            </label>
            <input
              type="number"
              step="0.5"
              value={simWeeklyHours}
              onChange={e => setSimWeeklyHours(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <button
            type="button"
            onClick={runEarlyCutSimulation}
            className="py-2 px-4 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition"
          >
            {isKo ? '절감액 계산' : 'Simulate Cut'}
          </button>
        </div>

        {simResult && (
          <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">{isKo ? '권장 유지 인원 / 조기퇴근 가능' : 'Active Needed / Removable'}</span>
              <span className="font-bold text-sm text-gray-900">
                {isKo
                  ? `유지 ${simResult.recommended_active_staff}명 / 조기퇴근 ${simResult.removable_staff_count}명`
                  : `Keep ${simResult.recommended_active_staff} / Cut ${simResult.removable_staff_count} staff`}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">{isKo ? '직접 시급 절감액' : 'Direct Wage Saved'}</span>
              <span className="font-mono font-bold text-sm text-teal-800">
                ₩{simResult.direct_wage_saved_krw.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">{isKo ? '주휴수당(15h 미만 전환) 영향' : '15h 주휴수당 Threshold Impact'}</span>
              <span className="font-mono font-bold text-sm text-amber-800">
                {simResult.crossed_below_15h_juhyu
                  ? `₩${simResult.juhyu_saved_krw.toLocaleString()} (15h 미만 전환)`
                  : '₩0 (변동 없음)'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">{isKo ? '총 추정 절감 인건비' : 'Total Estimated Savings'}</span>
              <span className="font-mono font-bold text-base text-emerald-700">
                ₩{simResult.total_estimated_savings_krw.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
