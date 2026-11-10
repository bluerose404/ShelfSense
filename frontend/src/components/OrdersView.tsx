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
          cls: 'bg-amber-100 text-amber-800 border-amber-300',
        };
      case 'approved':
        return {
          label: isKo ? '승인됨 (Approved)' : 'Approved',
          cls: 'bg-teal-100 text-teal-800 border-teal-300',
        };
      case 'edited':
        return {
          label: isKo ? '수량수정 승인 (Edited)' : 'Edited & Approved',
          cls: 'bg-blue-100 text-blue-800 border-blue-300',
        };
      case 'incoming':
        return {
          label: isKo ? '입고 대기 (Incoming)' : 'Incoming',
          cls: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        };
      case 'received':
        return {
          label: isKo ? '입고 완료 (Received)' : 'Received',
          cls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        };
      case 'rejected':
        return {
          label: isKo ? '반려됨 (Rejected)' : 'Rejected',
          cls: 'bg-red-100 text-red-800 border-red-300',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isKo ? '발주 추천 및 라이프사이클 관리' : 'Order Recommendations & Lifecycle'}
          </h2>
          <p className="text-sm text-gray-500">
            {isKo
              ? 'FEFO 소비기한 위험 제외, 안전 버퍼, 포장 규격 올림을 반영한 발주 추천 (사장님 최종 승인 필수)'
              : 'FEFO expiry-risk exclusion, safety buffer, and pack-size rounding with mandatory owner approval'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {autonomyLevel === 2 && proposedCount > 0 && (
            <button
              type="button"
              onClick={handleApproveAll}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isKo ? `제안 발주 원탭 일괄 승인 (${proposedCount}건)` : `One-Tap Approve All (${proposedCount})`}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isKo ? '추천 재계산' : 'Recalculate'}</span>
          </button>
        </div>
      </div>

      {/* Human-in-the-Loop Autonomy Level Selector (Level 1 & 2 selectable; Level 3 Disabled) */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {isKo ? '인간 중심(Human-in-the-Loop) 자율성 단계 설정' : 'Human-in-the-Loop Autonomy Level'}
            </h3>
            <p className="text-xs text-gray-500">
              {isKo
                ? '모든 발주는 사장님이 직접 승인해야 합니다. 3단계(완전 자동 발주)는 정책상 비활성화되어 있습니다.'
                : 'Owner approves everything. Level 3 (Full auto-order) is permanently disabled by safety policy.'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-gray-600">
              {isKo ? '활성 발주 합계:' : 'Total Active Spend:'}{' '}
              <span className={`font-bold ${totalActiveSpendKrw > spendCapKrw ? 'text-red-600' : 'text-teal-800'}`}>
                ₩{totalActiveSpendKrw.toLocaleString()}
              </span>{' '}
              / ₩{spendCapKrw.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleAutonomyChange(1)}
            className={`p-3 rounded-xl border text-left transition ${
              autonomyLevel === 1
                ? 'border-[#078B79] bg-teal-50/60 ring-1 ring-[#078B79]'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <p className="text-xs font-bold text-gray-900">
              {isKo ? 'Level 1: 개별 검토 및 승인 (Suggest)' : 'Level 1: Suggest Only'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {isKo ? '품목별로 수량을 확인하고 개별 승인합니다.' : 'Review and approve each item individually.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleAutonomyChange(2)}
            className={`p-3 rounded-xl border text-left transition ${
              autonomyLevel === 2
                ? 'border-[#078B79] bg-teal-50/60 ring-1 ring-[#078B79]'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <p className="text-xs font-bold text-gray-900">
              {isKo ? 'Level 2: 원탭 일괄 승인 (One-Tap Approve)' : 'Level 2: One-Tap Approve'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {isKo ? '추천 발주서를 한 번의 탭으로 일괄 승인합니다.' : 'Approve all proposed orders with a single tap.'}
            </p>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="p-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 text-left cursor-not-allowed opacity-75"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">
                {isKo ? 'Level 3: 완전 자동 발주 (비활성화)' : 'Level 3: Full Auto-Order (Disabled)'}
              </p>
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {isKo ? '안전 정책상 무인 자동 발주는 금지됩니다.' : 'Disabled: owner approval is always required.'}
            </p>
          </button>
        </div>
      </div>

      {/* Lifecycle Status Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-gray-100 p-1 rounded-lg flex flex-wrap gap-1 text-xs font-medium">
          {(['all', 'proposed', 'approved', 'edited', 'incoming', 'received', 'rejected'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md transition ${
                statusFilter === st ? 'bg-white shadow text-teal-800 font-semibold' : 'text-gray-600'
              }`}
            >
              {st === 'all' ? (isKo ? '전체' : 'All') : statusBadge(st).label}
            </button>
          ))}
        </div>
      </div>

      {/* Order Recommendation Cards */}
      {loading ? (
        <div className="p-8 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-400">
          {isKo ? '발주 추천 데이터 계산 중...' : 'Computing order recommendations...'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map(order => {
            const badge = statusBadge(order.status);
            const r = order.reason || {};
            const isPorkFixture = order.ingredient_code === 'ING-PORK';

            return (
              <div
                key={order.id}
                className={`bg-white p-5 rounded-xl border shadow-sm space-y-4 ${
                  isPorkFixture ? 'border-teal-400 ring-1 ring-teal-200' : 'border-gray-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-base text-gray-900">
                        {isKo ? order.ingredient_name_ko : order.ingredient_name_en}
                      </span>
                      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {r.price_surge?.is_surge && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800 border border-red-200 inline-flex items-center space-x-1">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          <span>
                            {isKo
                              ? `단가 급등 경고 (+${r.price_surge.surge_pct}% vs 4주 평균)`
                              : `Price Surge (+${r.price_surge.surge_pct}% vs 4w avg)`}
                          </span>
                        </span>
                      )}
                      {r.at_risk_qty && r.at_risk_qty > 0 ? (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          <span>
                            {isKo
                              ? `소비기한 만료위험 제외: ${r.at_risk_qty}${order.unit}`
                              : `Excluded At-Risk Stock: ${r.at_risk_qty} ${order.unit}`}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {isKo ? order.supplier_name_ko : order.supplier_name_en} ·{' '}
                      {isKo ? `마감 ${order.cutoff_time}` : `Cutoff ${order.cutoff_time}`} ·{' '}
                      {isKo ? `예상 입고일 ${order.expected_delivery_date}` : `ETA ${order.expected_delivery_date}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-teal-800">
                      {order.effective_qty} {order.unit}{' '}
                      <span className="text-xs font-normal text-gray-500">
                        ({order.packs_count} {isKo ? '박스/팩' : 'packs'} × {order.pack_size}{order.unit})
                      </span>
                    </p>
                    <p className="text-xs font-semibold text-gray-700">
                      ₩{order.total_cost_krw.toLocaleString()} (₩{order.unit_cost_krw.toLocaleString()}/{order.unit})
                    </p>
                  </div>
                </div>

                {/* Formula Breakdown Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                  <div>
                    <span className="text-gray-500 block">{isKo ? '예상 수요량' : 'Projected Demand'}</span>
                    <span className="font-mono font-bold text-gray-900">{r.demand_qty} {order.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{isKo ? '+ 안전 버퍼(10%)' : '+ Safety Buffer'}</span>
                    <span className="font-mono font-bold text-gray-900">+{r.buffer_qty} {order.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{isKo ? '- 가용 재고(FEFO)' : '- Usable Stock'}</span>
                    <span className="font-mono font-bold text-teal-800">-{r.usable_qty} {order.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{isKo ? '만료위험 제외(소비기한)' : 'At-Risk Excluded'}</span>
                    <span className="font-mono font-bold text-red-600">{r.at_risk_qty || 0} {order.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{isKo ? '= 순 필요량' : '= Net Need'}</span>
                    <span className="font-mono font-bold text-gray-900">{r.net_need_qty} {order.unit}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">{isKo ? '→ 포장규격 발주량' : '→ Order (Rounded)'}</span>
                    <span className="font-mono font-bold text-teal-800">{order.recommended_qty} {order.unit}</span>
                  </div>
                </div>

                {/* Inline Quantity Editor if Active */}
                {editingOrderId === order.id && (
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-xs font-semibold text-blue-900">
                      {isKo ? `수정 발주 수량 (${order.unit}):` : `Edited Order Qty (${order.unit}):`}
                    </span>
                    <input
                      type="number"
                      step={order.pack_size}
                      value={editQtyValue}
                      onChange={e => setEditQtyValue(Number(e.target.value))}
                      className="w-28 px-3 py-1 bg-white border border-blue-300 rounded text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'edited', editQtyValue, 'Owner modified quantity')}
                      className="px-3 py-1 bg-blue-700 text-white rounded text-xs font-semibold hover:bg-blue-800"
                    >
                      {isKo ? '수정 수량으로 승인' : 'Save & Approve Edited'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingOrderId(null)}
                      className="px-2.5 py-1 bg-white border border-gray-300 text-gray-600 rounded text-xs"
                    >
                      {isKo ? '취소' : 'Cancel'}
                    </button>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {order.status === 'proposed' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'approved', order.recommended_qty)}
                        className="flex items-center space-x-1 px-3.5 py-1.5 bg-[#078B79] text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isKo ? '승인 (Approve)' : 'Approve'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrderId(order.id);
                          setEditQtyValue(order.effective_qty);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isKo ? '수량 변경 (Edit)' : 'Edit Qty'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'rejected', undefined, 'Rejected by owner')}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isKo ? '반려 (Reject)' : 'Reject'}</span>
                      </button>
                    </>
                  )}

                  {(order.status === 'approved' || order.status === 'edited') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'incoming')}
                        className="flex items-center space-x-1 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isKo ? '발주서 전송 → 입고대기 (Incoming)' : 'Dispatch → Mark Incoming'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrderId(order.id);
                          setEditQtyValue(order.effective_qty);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isKo ? '수량 재수정' : 'Edit Qty'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTransition(order.id, 'rejected')}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isKo ? '반려' : 'Reject'}</span>
                      </button>
                    </>
                  )}

                  {order.status === 'incoming' && (
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'received', order.effective_qty)}
                      className="flex items-center space-x-1 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>{isKo ? '입고 완료 확정 (로트 자동 생성)' : 'Confirm Received (Create Lot)'}</span>
                    </button>
                  )}

                  {order.status === 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleTransition(order.id, 'proposed')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
                    >
                      {isKo ? '제안 상태로 복원' : 'Restore to Proposed'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
