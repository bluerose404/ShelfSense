import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, Boxes, ShoppingCart, ChefHat, Trash2, Users,
  ShieldAlert, CheckCircle2, Info, AlertTriangle
} from 'lucide-react';

export interface MorningSummaryProps {
  onNavigate?: (tabId: string) => void;
}

export default function SummaryView({ onNavigate }: MorningSummaryProps) {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [approvedMsg, setApprovedMsg] = useState<string | null>(null);

  const fetchMorningSummary = () => {
    setLoading(true);
    fetch('/api/summary/morning')
      .then(r => r.json())
      .then(data => {
        setSummary(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMorningSummary();
  }, []);

  const handleQuickApproveAll = () => {
    fetch('/api/orders/approve-all', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setApprovedMsg(
          isKo
            ? `${data.approved_count}건의 제안 발주가 승인되었습니다.`
            : `Approved ${data.approved_count} proposed orders.`
        );
        fetchMorningSummary();
      })
      .catch(err => console.error(err));
  };

  if (loading || !summary) {
    return (
      <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
        {isKo ? '모닝 브리핑 데이터를 불러오는 중...' : 'Loading morning summary...'}
      </div>
    );
  }

  const { kpis, inventory_alerts, ordering_alerts, prep_and_labor } = summary;
  const porkOrder = ordering_alerts?.pork_highlight;

  return (
    <div className="space-y-8">
      {/* Morning Summary Hero — the one bold moment (DESIGN.md §4) */}
      <section className="ss-hero space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-paper/80">
          <span>
            {isKo
              ? `모닝 운영 브리핑 (${summary.demo_clock} 수요일)`
              : `Morning operations brief (${summary.demo_clock} Wed)`}
          </span>
          <span className="tabular-nums">
            {isKo
              ? `예측 오차 WAPE ${kpis.forecast_wape_pct}% (홀드아웃 커버리지 ${kpis.pooled_coverage_pct}%)`
              : `Forecast WAPE ${kpis.forecast_wape_pct}% (Holdout coverage ${kpis.pooled_coverage_pct}%)`}
          </span>
        </div>

        <h1 className="ss-hero-statement">
          {isKo
            ? '오늘 돼지 앞다리살 25.0 kg을 발주하세요.'
            : 'Order 25.0 kg of pork shoulder today.'}
        </h1>

        <p className="text-base text-paper/80 max-w-[68ch]">
          {isKo
            ? `재고 4.0 kg(Lot A, 소비기한 11-05)이 사용 주기 전에 만료되어 제외되었습니다. 총 ${ordering_alerts.proposed_orders_count}건(₩${ordering_alerts.total_proposed_spend_krw.toLocaleString()})의 발주가 사장님 승인을 기다리고 있습니다.`
            : `4.0 kg in stock (Lot A, 소비기한 11-05) expires before the coverage window ends. ${ordering_alerts.proposed_orders_count} proposed orders (₩${ordering_alerts.total_proposed_spend_krw.toLocaleString()}) are waiting for your approval.`}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onNavigate?.('orders')}
            className="ss-btn ss-btn-primary"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            <span>{isKo ? '발주서 검토 및 승인' : 'Review and approve orders'}</span>
          </button>

          {ordering_alerts?.proposed_orders_count > 0 && summary.autonomy_level === 2 && (
            <button
              type="button"
              onClick={handleQuickApproveAll}
              className="ss-btn ss-btn-inverse"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>
                {isKo
                  ? `제안 발주 일괄 승인 (${ordering_alerts.proposed_orders_count}건)`
                  : `Approve all proposed orders (${ordering_alerts.proposed_orders_count})`}
              </span>
            </button>
          )}
        </div>
      </section>

      {approvedMsg && (
        <div className="ss-note ss-note-attention">
          <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
          <span className="font-bold">{approvedMsg}</span>
        </div>
      )}

      {/* Key Figures — Shelf-label tiles */}
      <section className="ss-section">
        <h2 className="ss-section-title">
          {isKo ? '오늘의 핵심 지표' : 'Key figures this morning'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="ss-tile">
            <div className="ss-figure">{kpis.prime_cost_pct}%</div>
            <div className="ss-figure-label">
              {isKo ? '프라임 코스트 비율' : 'Prime cost share'}
            </div>
            <p className="ss-meta mt-2 tabular-nums">
              {isKo
                ? `식자재 ${kpis.food_cost_pct}% + 인건비 ${kpis.labor_cost_pct}%`
                : `Food ${kpis.food_cost_pct}% + Labor ${kpis.labor_cost_pct}%`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('forecast')}
            className="ss-tile text-left cursor-pointer hover:bg-ink/5"
          >
            <div className="ss-figure">{kpis.forecast_wape_pct}%</div>
            <div className="ss-figure-label">
              {isKo ? '예측 오차 (WAPE)' : 'Forecast error (WAPE)'}
            </div>
            <p className="ss-meta mt-2 tabular-nums">
              {isKo
                ? `기준선 ${kpis.baseline_wape_pct}% 대비 개선`
                : `Baseline ${kpis.baseline_wape_pct}% · Cov ${kpis.pooled_coverage_pct}%`}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('stock')}
            className="ss-tile ss-tile-critical text-left cursor-pointer"
          >
            <div className="ss-figure">
              {inventory_alerts.urgent_lots_count}{isKo ? '건' : ''}
            </div>
            <div className="ss-figure-label">
              {isKo ? '소비기한 임박 로트 (2일 이내)' : 'Urgent 소비기한 lots (≤2d)'}
            </div>
            <p className="text-xs text-paper/80 mt-2">
              {isKo ? '앞다리살 Lot A (4.0 kg, 11-05)' : 'Pork Lot A (4.0 kg, 11-05)'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('orders')}
            className={`ss-tile text-left cursor-pointer ${
              ordering_alerts.proposed_orders_count > 0 ? 'ss-tile-attention' : 'hover:bg-ink/5'
            }`}
          >
            <div className="ss-figure">
              {ordering_alerts.proposed_orders_count}{isKo ? '건' : ''}
            </div>
            <div className="ss-figure-label">
              {isKo ? '승인 대기 발주' : 'Proposed orders'}
            </div>
            <p className="text-xs mt-2 tabular-nums opacity-85">
              ₩{ordering_alerts.total_proposed_spend_krw.toLocaleString()}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate?.('labor')}
            className="ss-tile text-left cursor-pointer hover:bg-ink/5"
          >
            <div className="ss-figure">{kpis.labor_cost_pct}%</div>
            <div className="ss-figure-label">
              {isKo ? '주간 인건비 비율 (목표 30%)' : 'Labor draft (30% target)'}
            </div>
            <p className="ss-meta mt-2 tabular-nums">
              ₩{prep_and_labor.labor_draft_cost_krw.toLocaleString()} / ₩{prep_and_labor.labor_budget_krw.toLocaleString()}
            </p>
          </button>
        </div>
      </section>

      {/* Three Operational Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Section 1: Pork Shoulder & Expiry Risk */}
        <section className="ss-section flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="ss-section-title">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              <span>{isKo ? '발주 및 소비기한 위험' : 'Ordering & 소비기한 risk'}</span>
            </h2>
            <div className="flex items-center justify-between gap-2">
              <span className="ss-chip ss-chip-critical">
                <AlertTriangle aria-hidden="true" />
                {isKo ? '만료 위험 4.0 kg 제외' : '4.0 kg at risk excluded'}
              </span>
              <span className="ss-meta tabular-nums">ING-PORK</span>
            </div>
            <h3 className="text-base font-bold">
              {isKo
                ? '돼지 앞다리살 25.0 kg 발주 추천'
                : 'Pork shoulder: 25.0 kg order recommended'}
            </h3>
            <p className="text-sm ss-muted">
              {isKo
                ? '예상 수요 21.6 kg(270식×80g) + 안전 버퍼 2.16 kg = 총 23.76 kg 필요. 현재 재고 6.0 kg 중 Lot A(4.0 kg, 소비기한 11-05)는 공급 주기 내 만료 위험으로 제외되고 Lot B(2.0 kg)만 가용하여 순 필요량 21.76 kg, 포장 규격(5 kg×5팩) 기준 25.0 kg 발주를 제안합니다.'
                : 'Demand 21.6 kg (270×80 g) + 10% buffer 2.16 kg = 23.76 kg gross. Lot A (4.0 kg, 소비기한 11-05) is excluded as at-risk; Lot B (2.0 kg) is usable, leaving 21.76 kg net need rounded to 25.0 kg (5×5 kg packs).'}
            </p>
            {porkOrder?.reason?.price_surge?.is_surge && (
              <div className="ss-note ss-note-attention">
                <AlertTriangle className="w-4 h-4 text-signal" aria-hidden="true" />
                <span>
                  {isKo
                    ? `최근 입고 단가가 4주 평균 대비 +${porkOrder.reason.price_surge.surge_pct}% 상승했습니다.`
                    : `Latest purchase price is +${porkOrder.reason.price_surge.surge_pct}% above the 4-week average.`}
                </span>
              </div>
            )}
          </div>
          <div className="pt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('orders')}
              className="ss-btn ss-btn-primary ss-btn-sm"
            >
              {isKo ? '발주서 열기' : 'Open orders'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('stock')}
              className="ss-btn ss-btn-secondary ss-btn-sm"
            >
              {isKo ? '재고 로트 확인' : 'Inspect stock lots'}
            </button>
          </div>
        </section>

        {/* Section 2: Kitchen Prep & FEFO */}
        <section className="ss-section flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="ss-section-title">
              <ChefHat className="w-5 h-5" aria-hidden="true" />
              <span>{isKo ? '일일 주방 프랩 & 선입선출' : 'Daily kitchen prep & FEFO'}</span>
            </h2>
            <div className="flex items-center justify-between gap-2">
              <span className="ss-chip ss-chip-info">
                {isKo ? '우선 출고 지시' : 'Pull earliest lot first'}
              </span>
              <span className="ss-meta tabular-nums">2026-11-04</span>
            </div>
            <h3 className="text-base font-bold tabular-nums">
              {isKo
                ? `오늘 예상 식수: 중앙 ${prep_and_labor.today_median_covers}식 (상한 ${prep_and_labor.today_upper_covers}식)`
                : `Projected covers today: ${prep_and_labor.today_median_covers} median (${prep_and_labor.today_upper_covers} upper)`}
            </h3>
            <p className="text-sm ss-muted">
              {isKo
                ? '10개 메뉴(메인 9종, 반찬 계란말이 1종)의 파트별 손질량과 수율 손실률이 계산되었습니다. 내일(11-05) 소비기한이 만료되는 앞다리살 BATCH-PORK-001(4.0 kg)을 오전 프랩에 먼저 소진하세요.'
                : 'Station prep targets across 9 main dishes and 1 side dish (Rolled Omelet) include yield loss. Pull BATCH-PORK-001 (4.0 kg, 소비기한 11-05) first during morning prep.'}
            </p>
          </div>
          <div className="pt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('prep')}
              className="ss-btn ss-btn-primary ss-btn-sm"
            >
              {isKo ? '일일 프랩 시트 열기' : 'Open prep sheet'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('waste')}
              className="ss-btn ss-btn-secondary ss-btn-sm"
            >
              {isKo ? '폐기 기록' : 'Log waste'}
            </button>
          </div>
        </section>

        {/* Section 3: Labor Draft & Compliance */}
        <section className="ss-section flex flex-col justify-between">
          <div className="space-y-3">
            <h2 className="ss-section-title">
              <Users className="w-5 h-5" aria-hidden="true" />
              <span>{isKo ? '인력 스케줄 & 근로기준법' : 'Labor draft & compliance'}</span>
            </h2>
            <div className="flex items-center justify-between gap-2">
              <span className="ss-chip ss-chip-ok">
                <CheckCircle2 aria-hidden="true" />
                {isKo ? '예산 및 법규 준수' : 'Within budget & compliant'}
              </span>
              <span className="ss-meta tabular-nums">₩10,320/hr (2026)</span>
            </div>
            <h3 className="text-base font-bold tabular-nums">
              {isKo
                ? `저녁 피크 홀 권장 인원: ${prep_and_labor.peak_front_staff}명 (48식/시간 기준)`
                : `Peak dinner front staff: ${prep_and_labor.peak_front_staff} (48 covers/h)`}
            </h3>
            <p className="text-sm ss-muted">
              {isKo
                ? '주간 스케줄 초안(92시간, ₩1,104,000 = 매출 대비 27.6%)이 목표 예산(30%, ₩1,200,000) 이내로 편성되었습니다. 전 직원 2026 최저임금 및 법정 휴게시간을 준수합니다.'
                : 'Weekly 92 h draft (₩1,104,000 = 27.6% of ₩4,000,000 sales) is within the 30% budget (₩1,200,000). All 8 staff meet 2026 minimum wage and break rules.'}
            </p>
            <div className="ss-note">
              <Info className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs">{isKo ? prep_and_labor.disclaimer_ko : prep_and_labor.disclaimer_en}</span>
            </div>
          </div>
          <div className="pt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('labor')}
              className="ss-btn ss-btn-primary ss-btn-sm"
            >
              {isKo ? '인력 스케줄 열기' : 'Open labor schedule'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="ss-btn ss-btn-secondary ss-btn-sm"
            >
              {isKo ? '설정 및 감사 로그' : 'Settings & audit log'}
            </button>
          </div>
        </section>
      </div>

      {/* Quick Module Directory */}
      <section className="ss-section">
        <h2 className="ss-section-title">
          {isKo ? '화면 바로가기' : 'All screens'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { id: 'forecast', label_ko: '7일 수요 예측', label_en: '7-day forecast', icon: TrendingUp },
            { id: 'stock', label_ko: '바코드 & FEFO 재고', label_en: 'Stock & scan', icon: Boxes },
            { id: 'orders', label_ko: '발주 라이프사이클', label_en: 'Orders', icon: ShoppingCart },
            { id: 'prep', label_ko: '일일 주방 프랩', label_en: 'Prep sheet', icon: ChefHat },
            { id: 'waste', label_ko: '폐기 기록/분석', label_en: 'Waste log', icon: Trash2 },
            { id: 'labor', label_ko: '인력 & 근로기준법', label_en: 'Labor & schedule', icon: Users },
          ].map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onNavigate?.(m.id)}
                className="ss-btn ss-btn-secondary justify-start"
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{isKo ? m.label_ko : m.label_en}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
