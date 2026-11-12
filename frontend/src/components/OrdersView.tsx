import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2, XCircle, Edit3, Send, PackageCheck,
  AlertTriangle, Lock, RefreshCw, ShieldCheck, TrendingUp
} from 'lucide-react';

export interface OrderItem {
  id: number;
  ingredient_id: number;
  ingredient_code: string;
  ingredient_name_ko: string;
  ingredient_name_en: string;
  unit: string;
  pack_size: number;
  supplier_id: number;
  supplier_name_ko: string;
  supplier_name_en: string;
  min_order_krw: number;
  cutoff_time: string;
  recommended_qty: number;
  approved_qty: number | null;
  effective_qty: number;
  packs_count: number;
  unit_cost_krw: number;
  total_cost_krw: number;
  status: 'proposed' | 'approved' | 'edited' | 'incoming' | 'received' | 'rejected';
  expected_delivery_date: string;
  reason: {
    coverage_window_days?: number;
    use_window_end?: string;
    demand_qty?: number;
    buffer_qty?: number;
    gross_need_qty?: number;
    usable_qty?: number;
    at_risk_qty?: number;
    net_need_qty?: number;
    pack_size?: number;
    packs_to_order?: number;
    price_surge?: {
      trailing_avg_krw: number;
      latest_price_krw: number;
      surge_pct: number;
      is_surge: boolean;
    };
  };
}

export function isAutonomyLevelSelectable(level: number): boolean {
  return level === 1 || level === 2;
}

export default function OrdersView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [autonomyLevel, setAutonomyLevel] = useState<number>(2);
  const [spendCapKrw, setSpendCapKrw] = useState<number>(1000000);
  const [totalActiveSpendKrw, setTotalActiveSpendKrw] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchOrders = (refresh: boolean = false) => {
    setLoading(true);
    fetch(`/api/orders/recommendations?refresh=${refresh}`)
      .then(r => r.json())
      .then(data => {
        setOrders(data.orders || []);
        setAutonomyLevel(data.autonomy_level || 2);
        setSpendCapKrw(data.spend_cap_krw || 1000000);
        setTotalActiveSpendKrw(data.total_active_spend_krw || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders(false);
  }, []);

  const handleAutonomyChange = (level: number) => {
    if (!isAutonomyLevelSelectable(level)) return;
    fetch('/api/settings/autonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autonomy_level: level }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.autonomy_level) {
          setAutonomyLevel(data.autonomy_level);
        }
      })
      .catch(err => console.error(err));
  };

  const handleTransition = (orderId: number, targetStatus: string, approvedQty?: number, note?: string) => {
    fetch(`/api/orders/${orderId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_status: targetStatus,
        approved_qty: approvedQty,
        note: note || '',
      }),
    })
      .then(r => r.json())
      .then(() => {
        setEditingOrderId(null);
        fetchOrders(false);
      })
      .catch(err => console.error(err));
  };

  const handleApproveAll = () => {
    fetch('/api/orders/approve-all', { method: 'POST' })
      .then(r => r.json())
      .then(() => fetchOrders(false))
      .catch(err => console.error(err));
  };

  const proposedCount = orders.filter(o => o.status === 'proposed').length;
  const filteredOrders = orders.filter(o => statusFilter === 'all' || o.status === statusFilter);

  const statusBadge = (st: OrderItem['status']) => {
    switch (st) {
      case 'proposed':
        return {
          label: isKo ? '제안됨 (Proposed)' : 'Proposed',
          cls: 'ss-chip-attention',
        };
      case 'approved':
        return {
          label: isKo ? '승인됨 (Approved)' : 'Approved',
          cls: 'ss-chip-info',
        };
      case 'edited':
        return {
          label: isKo ? '수량수정 승인 (Edited)' : 'Edited & approved',
          cls: 'ss-chip-info',
        };
      case 'incoming':
        return {
          label: isKo ? '입고 대기 (Incoming)' : 'Incoming',
          cls: 'ss-chip-info',
        };
      case 'received':
        return {
          label: isKo ? '입고 완료 (Received)' : 'Received',
          cls: 'ss-chip-ok',
        };
      case 'rejected':
        return {
          label: isKo ? '반려됨 (Rejected)' : 'Rejected',
          cls: 'ss-chip-critical',
        };
    }
  };

  return (
    <div>
      <h1 className="ss-page-title">
        {isKo ? '발주 추천 및 라이프사이클 관리' : 'Order recommendations & lifecycle'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? 'FEFO 소비기한 위험 제외, 안전 버퍼, 포장 규격 올림을 반영한 발주 추천입니다. 모든 발주는 사장님이 승인해야 확정됩니다.'
          : 'FEFO expiry-risk exclusion, safety buffer, and pack-size rounding with mandatory owner approval.'}
      </p>

      {/* Human-in-the-Loop Autonomy Level Selector (Level 1 & 2 selectable; Level 3 Disabled) */}
      <section className="ss-section">
        <div className="ss-section-title justify-between flex-wrap">
          <span>
            {isKo ? '인간 중심(Human-in-the-Loop) 자율성 단계' : 'Human-in-the-loop autonomy level'}
          </span>
          <span className="text-sm font-normal tabular-nums">
            {isKo ? '활성 발주 합계: ' : 'Total active spend: '}
            <strong>₩{totalActiveSpendKrw.toLocaleString()}</strong> / ₩{spendCapKrw.toLocaleString()}
            {totalActiveSpendKrw > spendCapKrw && (
              <span className="ss-chip ss-chip-critical ml-2">
                <AlertTriangle aria-hidden="true" />
                {isKo ? '한도 초과' : 'Over cap'}
              </span>
            )}
          </span>
        </div>

        <p className="text-sm ss-muted mb-4">
          {isKo
            ? '모든 발주는 사장님이 직접 승인해야 합니다. 3단계(완전 자동 발주)는 정책상 비활성화되어 있습니다.'
            : 'The owner approves every order. Level 3 (full auto-order) is permanently disabled.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleAutonomyChange(1)}
            className={`p-4 border text-left cursor-pointer ${
              autonomyLevel === 1
                ? 'bg-ink text-paper border-ink'
                : 'bg-paper text-ink border-ink/35 hover:bg-ink/5'
            }`}
          >
            <p className="text-sm font-bold">
              {isKo ? 'Level 1: 개별 검토 및 승인 (Suggest)' : 'Level 1: Suggest only'}
            </p>
            <p className={`text-xs mt-1 ${autonomyLevel === 1 ? 'text-paper/80' : 'ss-muted'}`}>
              {isKo ? '품목별로 수량을 확인하고 개별 승인합니다.' : 'Review and approve each item individually.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleAutonomyChange(2)}
            className={`p-4 border text-left cursor-pointer ${
              autonomyLevel === 2
                ? 'bg-ink text-paper border-ink'
                : 'bg-paper text-ink border-ink/35 hover:bg-ink/5'
            }`}
          >
            <p className="text-sm font-bold">
              {isKo ? 'Level 2: 원탭 일괄 승인 (One-tap approve)' : 'Level 2: One-tap approve'}
            </p>
            <p className={`text-xs mt-1 ${autonomyLevel === 2 ? 'text-paper/80' : 'ss-muted'}`}>
              {isKo ? '추천 발주서를 한 번의 탭으로 일괄 승인합니다.' : 'Approve all proposed orders with a single tap.'}
            </p>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="p-4 border border-dashed border-ink/35 bg-paper text-ink/35 text-left cursor-not-allowed"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {isKo ? 'Level 3: 완전 자동 발주 (비활성화)' : 'Level 3: Full auto-order (disabled)'}
              </p>
              <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs mt-1">
              {isKo ? '안전 정책상 무인 자동 발주는 금지됩니다.' : 'Disabled: owner approval is always required.'}
            </p>
          </button>
        </div>
      </section>

      {/* Filter & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="inline-flex flex-wrap border border-ink">
          {(['all', 'proposed', 'approved', 'edited', 'incoming', 'received', 'rejected'] as const).map(st => {
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-2 text-xs font-bold cursor-pointer ${
                  active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                }`}
              >
                {st === 'all' ? (isKo ? '전체' : 'All') : statusBadge(st).label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {autonomyLevel === 2 && proposedCount > 0 && (
            <button
              type="button"
              onClick={handleApproveAll}
              className="ss-btn ss-btn-primary ss-btn-sm"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>
                {isKo ? `제안 발주 일괄 승인 (${proposedCount}건)` : `Approve all proposed (${proposedCount})`}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            className="ss-btn ss-btn-secondary ss-btn-sm"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>{isKo ? '추천 재계산' : 'Recalculate'}</span>
          </button>
        </div>
      </div>

      {/* Order Recommendation List */}
      {loading ? (
        <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
          {isKo ? '발주 추천 데이터 계산 중...' : 'Computing order recommendations...'}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map(order => {
            const badge = statusBadge(order.status);
            const r = order.reason || {};
            const isPorkFixture = order.ingredient_code === 'ING-PORK';

            return (
              <section
                key={order.id}
                className={`border-t-2 border-ink pt-4 pb-6 space-y-4 ${
                  isPorkFixture ? 'bg-signal/10 px-4' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-lg">
                        {isKo ? order.ingredient_name_ko : order.ingredient_name_en}
                      </h2>
                      <span className={`ss-chip ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {r.price_surge?.is_surge && (
                        <span className="ss-chip ss-chip-attention">
                          <TrendingUp aria-hidden="true" />
                          <span>
                            {isKo
                              ? `단가 급등 (+${r.price_surge.surge_pct}% vs 4주 평균)`
                              : `Price surge (+${r.price_surge.surge_pct}% vs 4w avg)`}
                          </span>
                        </span>
                      )}
                      {r.at_risk_qty && r.at_risk_qty > 0 ? (
                        <span className="ss-chip ss-chip-critical">
                          <AlertTriangle aria-hidden="true" />
                          <span>
                            {isKo
                              ? `소비기한 만료위험 제외: ${r.at_risk_qty} ${order.unit}`
                              : `At-risk stock excluded: ${r.at_risk_qty} ${order.unit}`}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <p className="ss-meta mt-1">
                      {isKo ? order.supplier_name_ko : order.supplier_name_en}
                      {' — '}
                      {isKo ? `마감 ${order.cutoff_time}` : `Cutoff ${order.cutoff_time}`}
                      {', '}
                      {isKo ? `예상 입고일 ${order.expected_delivery_date}` : `ETA ${order.expected_delivery_date}`}
                    </p>
                  </div>

                  <div className="text-right tabular-nums">
                    <p className="text-xl font-bold">
                      {order.effective_qty} {order.unit}{' '}
                      <span className="text-xs font-normal ss-muted">
                        ({order.packs_count} {isKo ? '팩' : 'packs'} × {order.pack_size} {order.unit})
                      </span>
                    </p>
                    <p className="text-sm font-bold ss-muted">
                      ₩{order.total_cost_krw.toLocaleString()} (₩{order.unit_cost_krw.toLocaleString()}/{order.unit})
                    </p>
                  </div>
                </div>

                {/* Formula Breakdown Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                  <div className="ss-tile p-3">
                    <span className="ss-meta block">{isKo ? '예상 수요량' : 'Projected demand'}</span>
                    <span className="font-bold text-base tabular-nums">{r.demand_qty} {order.unit}</span>
                  </div>
                  <div className="ss-tile p-3">
                    <span className="ss-meta block">{isKo ? '안전 버퍼 (10%)' : 'Safety buffer'}</span>
                    <span className="font-bold text-base tabular-nums">+{r.buffer_qty} {order.unit}</span>
                  </div>
                  <div className="ss-tile p-3">
                    <span className="ss-meta block">{isKo ? '가용 재고 (FEFO)' : 'Usable stock'}</span>
                    <span className="font-bold text-base tabular-nums">−{r.usable_qty} {order.unit}</span>
                  </div>
                  <div className={`ss-tile p-3 ${(r.at_risk_qty || 0) > 0 ? 'ss-tile-critical' : ''}`}>
                    <span className={`block text-xs ${(r.at_risk_qty || 0) > 0 ? 'text-paper/80' : 'ss-meta'}`}>
                      {isKo ? '만료위험 제외 (소비기한)' : 'At-risk excluded'}
                    </span>
                    <span className="font-bold text-base tabular-nums">{r.at_risk_qty || 0} {order.unit}</span>
                  </div>
                  <div className="ss-tile p-3">
                    <span className="ss-meta block">{isKo ? '순 필요량' : 'Net need'}</span>
                    <span className="font-bold text-base tabular-nums">{r.net_need_qty} {order.unit}</span>
                  </div>
                  <div className="ss-tile p-3">
                    <span className="ss-meta block">{isKo ? '포장규격 발주량' : 'Order quantity'}</span>
                    <span className="font-bold text-base tabular-nums">{order.recommended_qty} {order.unit}</span>
                  </div>
                </div>

                {/* Inline Quantity Editor if Active */}
                {editingOrderId === order.id && (
                  <div className="ss-note ss-note-attention items-center flex-wrap">
                    <label className="text-sm font-bold">
                      {isKo ? `수정 발주 수량 (${order.unit}):` : `Edited order quantity (${order.unit}):`}
                    </label>
                    <input
                      type="number"
                      step={order.pack_size}
                      value={editQtyValue}
                      onChange={e => setEditQtyValue(Number(e.target.value))}
                      className="ss-input w-28 tabular-nums font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'edited', editQtyValue, 'Owner modified quantity')}
                      className="ss-btn ss-btn-primary ss-btn-sm"
                    >
                      {isKo ? '수정 수량으로 승인' : 'Save & approve order'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingOrderId(null)}
                      className="ss-btn ss-btn-secondary ss-btn-sm"
                    >
                      {isKo ? '취소' : 'Cancel'}
                    </button>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {order.status === 'proposed' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'approved', order.recommended_qty)}
                        className="ss-btn ss-btn-primary ss-btn-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '발주 승인' : 'Approve order'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrderId(order.id);
                          setEditQtyValue(order.effective_qty);
                        }}
                        className="ss-btn ss-btn-secondary ss-btn-sm"
                      >
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '수량 수정' : 'Edit quantity'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'rejected', undefined, 'Rejected by owner')}
                        className="ss-btn ss-btn-secondary ss-btn-sm"
                      >
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '발주 반려' : 'Reject order'}</span>
                      </button>
                    </>
                  )}

                  {(order.status === 'approved' || order.status === 'edited') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'incoming')}
                        className="ss-btn ss-btn-primary ss-btn-sm"
                      >
                        <Send className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '발주서 전송 (입고 대기)' : 'Send order (mark incoming)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrderId(order.id);
                          setEditQtyValue(order.effective_qty);
                        }}
                        className="ss-btn ss-btn-secondary ss-btn-sm"
                      >
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '수량 재수정' : 'Edit quantity'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'rejected')}
                        className="ss-btn ss-btn-secondary ss-btn-sm"
                      >
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        <span>{isKo ? '반려' : 'Reject order'}</span>
                      </button>
                    </>
                  )}

                  {order.status === 'incoming' && (
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'received', order.effective_qty)}
                      className="ss-btn ss-btn-primary ss-btn-sm"
                    >
                      <PackageCheck className="w-4 h-4" aria-hidden="true" />
                      <span>{isKo ? '입고 완료 확정 (로트 생성)' : 'Confirm received (create lot)'}</span>
                    </button>
                  )}

                  {order.status === 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'proposed')}
                      className="ss-btn ss-btn-secondary ss-btn-sm"
                    >
                      {isKo ? '제안 상태로 복원' : 'Restore to proposed'}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
