import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Info, CheckCircle2, Scissors, ShieldAlert } from 'lucide-react';

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
    <div>
      <h1 className="ss-page-title">
        {isKo ? '주간 인력 스케줄 초안 & 근로기준법 점검' : 'Weekly labor schedule draft & Korean labor law checks'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? '2026 최저임금(₩10,320/hr), 법정 휴게시간(4h→30m, 8h→1h), 주휴수당(15h 기준), 조기 퇴근 시뮬레이터입니다.'
          : '2026 minimum wage (₩10,320/hr), mandatory rest breaks, 주휴수당 (15 h threshold), and slow-shift early-cut simulator.'}
      </p>

      {/* Mandatory Non-Payroll Disclaimer Banner */}
      <div className="ss-note mb-6">
        <Info className="w-4 h-4" aria-hidden="true" />
        <div className="flex-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-sm">
              {isKo ? '급여 미실행 및 스케줄링 추정치 고지 (Disclaimer)' : 'Scheduling estimate disclaimer (not payroll)'}
            </p>
            <p className="text-sm ss-muted mt-0.5">{isKo ? disclaimerKo : disclaimerEn}</p>
          </div>
          <button
            type="button"
            onClick={handleToggle5Plus}
            aria-pressed={has5Plus}
            className={`px-3 py-2 text-xs font-bold border cursor-pointer ${
              has5Plus
                ? 'bg-ink text-paper border-ink'
                : 'bg-paper text-ink border-ink/35 hover:bg-ink/5'
            }`}
          >
            {isKo
              ? `5인 이상 가산수당 (1.5×): ${has5Plus ? '적용 중' : '미적용'}`
              : `5+ employees 1.5× multiplier: ${has5Plus ? 'On' : 'Off'}`}
          </button>
        </div>
      </div>

      {/* Canonical Labor Budget & Peak Staffing Fixture Tiles */}
      {budgetSummary && (
        <section className="ss-section">
          <h2 className="ss-section-title">
            {isKo ? '인건비 예산 및 피크 배치 기준' : 'Labor budget & peak staffing'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="ss-tile">
              <div className="ss-figure">₩{budgetSummary.labor_budget_krw.toLocaleString()}</div>
              <div className="ss-figure-label">
                {isKo
                  ? `목표 인건비 예산 (매출 ₩${budgetSummary.projected_sales_krw.toLocaleString()}의 ${budgetSummary.target_labor_pct}%)`
                  : `Labor budget (${budgetSummary.target_labor_pct}% of ₩${budgetSummary.projected_sales_krw.toLocaleString()})`}
              </div>
            </div>

            <div className="ss-tile">
              <div className="ss-figure">
                ₩{budgetSummary.draft_cost_krw.toLocaleString()} ({budgetSummary.draft_labor_pct}%)
              </div>
              <div className="ss-figure-label">
                {isKo
                  ? `스케줄 초안 (${budgetSummary.draft_hours}시간 × ₩${budgetSummary.avg_hourly_wage_krw.toLocaleString()})`
                  : `Draft cost (${budgetSummary.draft_hours} h × ₩${budgetSummary.avg_hourly_wage_krw.toLocaleString()})`}
              </div>
              <p className="ss-meta mt-2 tabular-nums">
                {isKo
                  ? `예산 대비 ₩${budgetSummary.budget_remaining_krw.toLocaleString()} 여유`
                  : `₩${budgetSummary.budget_remaining_krw.toLocaleString()} under budget`}
              </p>
            </div>

            <div className="ss-tile">
              <div className="ss-figure">
                {budgetSummary.peak_front_staff}{isKo ? '명' : ''}
              </div>
              <div className="ss-figure-label">
                {isKo ? '저녁 피크 홀 권장 인원 (48식/h ÷ 14식)' : 'Peak front staff (48 covers/h ÷ 14)'}
              </div>
              <p className="ss-meta mt-2">
                {isKo ? '18:00~19:30 저녁 피크 기준' : '18:00–19:30 dinner peak'}
              </p>
            </div>

            <div className="ss-tile">
              <div className="ss-figure">₩{minWageKrw.toLocaleString()}/hr</div>
              <div className="ss-figure-label">
                {isKo ? '2026년 법정 최저임금 기준' : '2026 statutory minimum wage'}
              </div>
              <p className="ss-meta mt-2">
                {isKo ? '전 직원 최저임금 이상 준수' : 'All 8 staff meet minimum wage'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Staff Schedule Table with Korean Labor Rule Checks */}
      <section className="ss-section">
        <h2 className="ss-section-title">
          <Users className="w-5 h-5" aria-hidden="true" />
          <span>{isKo ? '직원별 주간 근무표 및 근로기준법 점검' : 'Staff weekly schedule & compliance checks'}</span>
        </h2>

        {loading ? (
          <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
            {isKo ? '근무 스케줄 불러오는 중...' : 'Loading labor schedule...'}
          </div>
        ) : (
          <div className="ss-table-wrap">
            <table className="ss-table">
              <thead>
                <tr>
                  <th>{isKo ? '이름 / 역할' : 'Staff / role'}</th>
                  <th className="ss-num">{isKo ? '시급' : 'Hourly wage'}</th>
                  <th>{isKo ? '일 근무 / 휴게시간' : 'Shift / break'}</th>
                  <th className="ss-num">{isKo ? '주 유급시간' : 'Weekly hours'}</th>
                  <th className="ss-num">{isKo ? '주휴수당 (≥15h)' : '주휴수당 (≥15h)'}</th>
                  <th className="ss-num">{isKo ? '주간 추정 합계' : 'Est. weekly total'}</th>
                  <th>{isKo ? '법규 점검 상태' : 'Compliance'}</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map(st => {
                  const hasViolation = st.violations.length > 0;
                  return (
                    <tr key={st.staff_id} className={hasViolation ? 'ss-row-critical' : ''}>
                      <td>
                        <span className="font-bold">{isKo ? st.name_ko : st.name_en}</span>
                        <span className="ss-chip ss-chip-ok ml-2 capitalize">{st.role}</span>
                      </td>
                      <td className="ss-num">₩{st.hourly_wage_krw.toLocaleString()}</td>
                      <td className="tabular-nums">
                        {st.scheduled_days}{isKo ? '일' : 'd'} × {st.shift_duration_hours}h{' '}
                        <span className="ss-muted">
                          ({isKo ? `휴게 ${st.break_minutes}분` : `break ${st.break_minutes}m`})
                        </span>
                      </td>
                      <td className="ss-num font-bold">
                        {st.weekly_paid_hours}h{' '}
                        <span className="text-xs font-normal ss-muted">/ {st.max_weekly_hours}h</span>
                      </td>
                      <td className="ss-num">
                        {st.juhyu_eligible ? (
                          <span className="ss-chip ss-chip-attention">
                            ₩{st.juhyu_allowance_krw.toLocaleString()}
                          </span>
                        ) : (
                          <span className="ss-muted">₩0 (&lt;15h)</span>
                        )}
                      </td>
                      <td className="ss-num font-bold">
                        ₩{st.total_estimated_weekly_pay_krw.toLocaleString()}
                      </td>
                      <td>
                        {!hasViolation ? (
                          <span className="ss-chip ss-chip-ok">
                            <CheckCircle2 aria-hidden="true" />
                            {isKo ? '준수 (Compliant)' : 'Compliant'}
                          </span>
                        ) : (
                          <span className="ss-chip ss-chip-critical">
                            <ShieldAlert aria-hidden="true" />
                            {st.violations[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Early-Cut Simulator Panel */}
      <section className="ss-section">
        <h2 className="ss-section-title">
          <Scissors className="w-5 h-5" aria-hidden="true" />
          <span>{isKo ? '한산 시간대 조기 퇴근(Early-cut) 시뮬레이터' : 'Slow-shift early-cut simulator'}</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end mb-4">
          <div>
            <label className="ss-label">
              {isKo ? '예상 시간당 식수' : 'Projected covers/h'}
            </label>
            <input
              type="number"
              value={simProjectedCovers}
              onChange={e => setSimProjectedCovers(Number(e.target.value))}
              className="ss-input w-full tabular-nums"
            />
          </div>
          <div>
            <label className="ss-label">
              {isKo ? '실제 시간당 식수' : 'Actual covers/h'}
            </label>
            <input
              type="number"
              value={simActualCovers}
              onChange={e => setSimActualCovers(Number(e.target.value))}
              className="ss-input w-full tabular-nums"
            />
          </div>
          <div>
            <label className="ss-label">
              {isKo ? '현재 배치 홀 인원' : 'Scheduled staff'}
            </label>
            <input
              type="number"
              value={simScheduledStaff}
              onChange={e => setSimScheduledStaff(Number(e.target.value))}
              className="ss-input w-full tabular-nums"
            />
          </div>
          <div>
            <label className="ss-label">
              {isKo ? '단축 시간 (h)' : 'Cut hours'}
            </label>
            <input
              type="number"
              step="0.5"
              value={simCutHours}
              onChange={e => setSimCutHours(Number(e.target.value))}
              className="ss-input w-full tabular-nums"
            />
          </div>
          <div>
            <label className="ss-label">
              {isKo ? '직원 주 누적시간' : 'Staff weekly hours'}
            </label>
            <input
              type="number"
              step="0.5"
              value={simWeeklyHours}
              onChange={e => setSimWeeklyHours(Number(e.target.value))}
              className="ss-input w-full tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={runEarlyCutSimulation}
            className="ss-btn ss-btn-primary"
          >
            {isKo ? '절감액 계산' : 'Calculate savings'}
          </button>
        </div>

        {simResult && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="ss-tile">
              <div className="ss-figure">
                {simResult.recommended_active_staff} / {simResult.removable_staff_count}
              </div>
              <div className="ss-figure-label">
                {isKo ? '권장 유지 인원 / 조기퇴근 가능' : 'Keep active / removable staff'}
              </div>
            </div>
            <div className="ss-tile">
              <div className="ss-figure">₩{simResult.direct_wage_saved_krw.toLocaleString()}</div>
              <div className="ss-figure-label">
                {isKo ? '직접 시급 절감액' : 'Direct wage saved'}
              </div>
            </div>
            <div className="ss-tile">
              <div className="ss-figure">
                {simResult.crossed_below_15h_juhyu
                  ? `₩${simResult.juhyu_saved_krw.toLocaleString()}`
                  : '₩0'}
              </div>
              <div className="ss-figure-label">
                {isKo ? '주휴수당 (15h 기준) 영향' : '15 h 주휴수당 threshold impact'}
              </div>
            </div>
            <div className="ss-tile ss-tile-attention">
              <div className="ss-figure">₩{simResult.total_estimated_savings_krw.toLocaleString()}</div>
              <div className="ss-figure-label">
                {isKo ? '총 추정 절감 인건비' : 'Total estimated savings'}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
