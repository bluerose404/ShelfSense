import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, Boxes, ShoppingCart, ChefHat, Trash2, Users,
  ShieldAlert, CheckCircle2, ArrowRight, AlertCircle, Sparkles
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
            ? `${data.approved_count}건의 제안 발주가 원탭 일괄 승인되었습니다.`
            : `Approved ${data.approved_count} proposed orders with one tap.`
        );
        fetchMorningSummary();
      })
      .catch(err => console.error(err));
  };

  if (loading || !summary) {
    return (
      <div className="p-8 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-400">
        {isKo ? '모닝 브리핑 데이터를 불러오는 중...' : 'Loading morning summary briefing...'}
      </div>
    );
  }

  const { kpis, inventory_alerts, ordering_alerts, prep_and_labor } = summary;
  const porkOrder = ordering_alerts?.pork_highlight;

  return (
    <div className="space-y-6">
      {/* Morning Banner */}
      <div className="bg-gradient-to-r from-[#078B79] to-teal-800 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-teal-100 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>
              {isKo
                ? `모닝 운영 브리핑 · 시뮬레이션 시각: ${summary.demo_clock} (수요일)`
                : `Morning Operations Brief · Simulated Clock: ${summary.demo_clock} (Wed)`}
            </span>
          </div>
          <h2 className="text-2xl font-bold">
            {isKo
              ? '서울 김치찌개집 — 오늘 아침 핵심 의사결정 요약'
              : 'Seoul Kimchi Jjigae House — Morning Decision Summary'}
          </h2>
          <p className="text-xs text-teal-100 max-w-2xl">
            {isKo
              ? '백테스트 검증된 7일 수요 예측(WAPE 9.97%), FEFO 소비기한 위험 시뮬레이션, 발주 승인, 주방 프랩, 근로기준법 스케줄 초안이 준비되었습니다.'
              : 'Walk-forward 7-day forecast (WAPE 9.97%), FEFO expiry-risk simulation, order approvals, daily prep sheet, and Korean labor draft are ready.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {ordering_alerts?.proposed_orders_count > 0 && summary.autonomy_level === 2 && (
            <button
              type="button"
              onClick={handleQuickApproveAll}
              className="px-4 py-2.5 bg-white text-teal-900 rounded-xl text-xs font-bold hover:bg-teal-50 transition shadow-sm"
            >
              {isKo
                ? `제안 발주 원탭 일괄 승인 (${ordering_alerts.proposed_orders_count}건)`
                : `One-Tap Approve Orders (${ordering_alerts.proposed_orders_count})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate?.('orders')}
            className="px-4 py-2.5 bg-teal-900/60 border border-teal-400/40 text-white rounded-xl text-xs font-semibold hover:bg-teal-900 transition flex items-center space-x-1.5"
          >
            <span>{isKo ? '발주서 상세 검토' : 'Review Orders'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {approvedMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{approvedMsg}</span>
        </div>
      )}

      {/* Top 5 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">{isKo ? '프라임 코스트 비율' : 'Prime Cost %'}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.prime_cost_pct}%</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {isKo
              ? `원가 ${kpis.food_cost_pct}% + 인건비 ${kpis.labor_cost_pct}%`
              : `Food ${kpis.food_cost_pct}% + Labor ${kpis.labor_cost_pct}%`}
          </p>
        </div>

        <div
          onClick={() => onNavigate?.('forecast')}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-teal-500 transition"
        >
          <p className="text-xs text-gray-500">{isKo ? '모델 예측 오차 (Holdout WAPE)' : 'Model Forecast WAPE'}</p>
          <p className="text-2xl font-bold text-teal-800 mt-1">{kpis.forecast_wape_pct}%</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {isKo
              ? `기준선 ${kpis.baseline_wape_pct}% · 커버리지 ${kpis.pooled_coverage_pct}%`
              : `Base ${kpis.baseline_wape_pct}% · Cov ${kpis.pooled_coverage_pct}%`}
          </p>
        </div>

        <div
          onClick={() => onNavigate?.('stock')}
          className="bg-white p-4 rounded-xl border border-red-200 shadow-sm cursor-pointer hover:border-red-400 transition"
        >
          <p className="text-xs text-red-700 font-semibold">{isKo ? '소비기한 임박 (D-2 이내)' : 'Urgent 소비기한 (≤2d)'}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{inventory_alerts.urgent_lots_count}{isKo ? '건' : ' lot'}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {isKo ? '앞다리살 Lot A (4.0kg, 11-05)' : 'Pork Lot A (4.0kg, 11-05)'}
          </p>
        </div>

        <div
          onClick={() => onNavigate?.('orders')}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-teal-500 transition"
        >
          <p className="text-xs text-gray-500">{isKo ? '승인 대기 발주 추천' : 'Proposed Orders'}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {ordering_alerts.proposed_orders_count}{isKo ? '건' : ''}
          </p>
          <p className="text-[11px] text-teal-800 font-medium mt-1">
            ₩{ordering_alerts.total_proposed_spend_krw.toLocaleString()}
          </p>
        </div>

        <div
          onClick={() => onNavigate?.('labor')}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-teal-500 transition"
        >
          <p className="text-xs text-gray-500">{isKo ? '인건비 예산 대비 초안' : 'Labor Draft vs Budget'}</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{kpis.labor_cost_pct}%</p>
          <p className="text-[11px] text-gray-500 mt-1">
            ₩{prep_and_labor.labor_draft_cost_krw.toLocaleString()} / ₩{prep_and_labor.labor_budget_krw.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Priority Action Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: FEFO Expiry Risk & Pork Shoulder Order Highlight */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200 inline-flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                {isKo ? '핵심 식자재 발주 & 소비기한 경고' : 'Key Expiry-Risk & Order Alert'}
              </span>
              <span className="text-xs font-mono text-gray-400">ING-PORK</span>
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              {isKo ? '돼지 앞다리살 (Pork Shoulder) — 25.0 kg 발주 추천' : 'Pork Shoulder — 25.0 kg Order Recommended'}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {isKo
                ? '예상 수요 21.6kg(270식×80g) + 안전버퍼 2.16kg = 총 23.76kg 필요. 현재 재고 6.0kg 중 Lot A(4.0kg, 소비기한 11-05)는 공급주기 내 만료 위험으로 제외되고 Lot B(2.0kg)만 가용하여 순 필요량 21.76kg → 5kg×5팩(25.0kg) 발주를 제안합니다.'
                : 'Demand 21.6kg (270×80g) + 10% buffer 2.16kg = 23.76kg gross. Lot A (4.0kg, 소비기한 11-05) is excluded as at-risk; Lot B (2.0kg) is usable -> net need 21.76kg -> 25.0kg (5×5kg packs).'}
            </p>
            {porkOrder?.reason?.price_surge?.is_surge && (
              <p className="text-xs font-semibold text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                ⚠ {isKo
                  ? `최근 입고 단가가 4주 평균 대비 +${porkOrder.reason.price_surge.surge_pct}% 상승했습니다.`
                  : `Latest purchase price is +${porkOrder.reason.price_surge.surge_pct}% above 4-week average.`}
              </p>
            )}
          </div>
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('orders')}
              className="flex-1 py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition"
            >
              {isKo ? '발주 추천 화면으로 이동' : 'Go to Orders'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('stock')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
            >
              {isKo ? 'FEFO 로트 확인' : 'View Lots'}
            </button>
          </div>
        </div>

        {/* Card 2: Today's Prep Sheet & FEFO Pull */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 inline-flex items-center">
                <ChefHat className="w-3.5 h-3.5 mr-1" />
                {isKo ? '오늘의 주방 프랩 & 선입선출' : "Today's Kitchen Prep & FEFO"}
              </span>
              <span className="text-xs text-gray-400">2026-11-04 (Wed)</span>
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              {isKo
                ? `오늘 예상 총 식수: 중앙 ${prep_and_labor.today_median_covers}식 (안전상한 ${prep_and_labor.today_upper_covers}식)`
                : `Today Projected Covers: Median ${prep_and_labor.today_median_covers} (Upper ${prep_and_labor.today_upper_covers})`}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {isKo
                ? '10개 메뉴(메인 9종, 반찬 계란말이 1종)의 파트별(조리화구·전처리·구이) 손질량과 수율 손실률이 계산되었습니다. 내일(11-05) 소비기한이 만료되는 앞다리살 BATCH-PORK-001(4.0kg)을 오늘 오전 프랩에 최우선 소진하세요.'
                : 'Station prep targets across 9 main dishes and 1 side dish (Rolled Omelet) include yield loss. Pull BATCH-PORK-001 (4.0kg, expiring 11-05) first during morning prep.'}
            </p>
          </div>
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('prep')}
              className="flex-1 py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition"
            >
              {isKo ? '일일 프랩 시트 열기' : 'Open Prep Sheet'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('waste')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
            >
              {isKo ? '폐기 이력' : 'Waste Log'}
            </button>
          </div>
        </div>

        {/* Card 3: Labor Schedule & Peak Staffing */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200 inline-flex items-center">
                <Users className="w-3.5 h-3.5 mr-1" />
                {isKo ? '인력 스케줄 & 근로기준법' : 'Labor Draft & Compliance'}
              </span>
              <span className="text-xs text-gray-400">₩10,320/hr (2026)</span>
            </div>
            <h3 className="font-bold text-gray-900 text-base">
              {isKo
                ? `저녁 피크 홀 권장 인원: ${prep_and_labor.peak_front_staff}명 (48식/시간 기준)`
                : `Peak Dinner Front Staffing: ${prep_and_labor.peak_front_staff} Staff (48 covers/h)`}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {isKo
                ? '주간 스케줄 초안(92시간, ₩1,104,000 = 매출 대비 27.6%)이 목표 예산(30%, ₩1,200,000) 이내로 편성되었습니다. 전 직원 2026 최저임금 및 법정 휴게시간을 준수합니다.'
                : 'Weekly 92h draft (₩1,104,000 = 27.6% of ₩4,000,000 sales) is within the 30% budget (₩1,200,000). All 8 staff meet 2026 minimum wage and break rules.'}
            </p>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-start space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
              <span>{isKo ? prep_and_labor.disclaimer_ko : prep_and_labor.disclaimer_en}</span>
            </div>
          </div>
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('labor')}
              className="flex-1 py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition"
            >
              {isKo ? '인력 & 조기퇴근 시뮬레이터' : 'Open Labor & Early-Cut'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
            >
              {isKo ? '설정 & 감사' : 'Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Module Directory */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { id: 'forecast', label_ko: '7일 수요 예측', label_en: '7-Day Forecast', icon: TrendingUp },
          { id: 'stock', label_ko: '바코드 & FEFO 재고', label_en: 'Scan & FEFO Stock', icon: Boxes },
          { id: 'orders', label_ko: '발주 라이프사이클', label_en: 'Order Lifecycle', icon: ShoppingCart },
          { id: 'prep', label_ko: '일일 주방 프랩', label_en: 'Daily Prep Sheet', icon: ChefHat },
          { id: 'waste', label_ko: '폐기 등록/분석', label_en: 'Waste Analytics', icon: Trash2 },
          { id: 'labor', label_ko: '인력 & 근로기준법', label_en: 'Labor & Law Check', icon: Users },
        ].map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onNavigate?.(m.id)}
              className="p-3 bg-white border border-gray-200 rounded-xl hover:border-teal-500 hover:bg-teal-50/30 transition flex items-center space-x-2 text-left shadow-sm"
            >
              <Icon className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="text-xs font-semibold text-gray-800">
                {isKo ? m.label_ko : m.label_en}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
