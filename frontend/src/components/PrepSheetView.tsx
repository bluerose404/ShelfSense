import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Square, ShieldAlert } from 'lucide-react';

export interface DishPrepItem {
  menu_item_id: number;
  menu_code: string;
  name_ko: string;
  name_en: string;
  station: 'kitchen' | 'prep' | 'grill';
  is_main_dish: boolean;
  lunch_portions: number;
  dinner_portions: number;
  total_median_portions: number;
  total_upper_portions: number;
  safety_buffer_portions: number;
  ingredients: {
    ingredient_id: number;
    ingredient_code: string;
    name_ko: string;
    name_en: string;
    unit: string;
    yield_loss_pct: number;
    prep_qty_median: number;
    prep_qty_upper: number;
  }[];
}

export interface IngredientPrepTotal {
  ingredient_id: number;
  ingredient_code: string;
  name_ko: string;
  name_en: string;
  unit: string;
  yield_loss_pct: number;
  lunch_prep_qty: number;
  dinner_prep_qty: number;
  total_prep_qty_median: number;
  total_prep_qty_upper: number;
  fefo_lot_batch: string | null;
  fefo_lot_expiry: string | null;
  fefo_lot_qty: number;
}

export default function PrepSheetView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [targetDate, setTargetDate] = useState<string>('2026-11-04');
  const [dishes, setDishes] = useState<DishPrepItem[]>([]);
  const [ingredientTotals, setIngredientTotals] = useState<IngredientPrepTotal[]>([]);
  const [stationFilter, setStationFilter] = useState<'all' | 'kitchen' | 'prep' | 'grill'>('all');
  const [completedDishes, setCompletedDishes] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/prep/sheet')
      .then(r => r.json())
      .then(data => {
        setTargetDate(data.target_date || '2026-11-04');
        setDishes(data.dishes || []);
        setIngredientTotals(data.ingredient_totals || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const toggleDishDone = (id: number) => {
    setCompletedDishes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredDishes = dishes.filter(
    d => stationFilter === 'all' || d.station === stationFilter
  );

  const stationLabel = (st: DishPrepItem['station']) => {
    if (st === 'kitchen') return isKo ? '조리화구 (Kitchen)' : 'Kitchen';
    if (st === 'prep') return isKo ? '전처리/반찬 (Prep)' : 'Prep';
    return isKo ? '구이 (Grill)' : 'Grill';
  };

  return (
    <div>
      <h1 className="ss-page-title">
        {isKo ? `일일 주방 프랩 시트 (${targetDate} 수요일)` : `Daily kitchen prep sheet (${targetDate} Wed)`}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? '점심·저녁 예측 식수, 수율 손실률(Yield loss), FEFO 우선 소진 로트(소비기한 임박순)를 반영한 조리 준비표입니다.'
          : 'Station prep targets incorporating lunch and dinner forecast covers, yield loss %, and FEFO first-lot pull guidance.'}
      </p>

      {/* Station Filter */}
      <div className="mb-6">
        <div className="inline-flex flex-wrap border border-ink">
          {(['all', 'kitchen', 'prep', 'grill'] as const).map(st => {
            const active = stationFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStationFilter(st)}
                className={`px-3 py-2 text-sm font-bold cursor-pointer ${
                  active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                }`}
              >
                {st === 'all' ? (isKo ? '전체 파트' : 'All stations') : stationLabel(st)}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
          {isKo ? '일일 프랩 시트 생성 중...' : 'Generating daily prep sheet...'}
        </div>
      ) : (
        <>
          {/* Dish-Level Prep Ticket Table */}
          <section className="ss-section">
            <h2 className="ss-section-title">
              {isKo ? '메뉴별 조리 준비 지시서' : 'Menu prep tickets by station'}
            </h2>
            <div className="ss-table-wrap">
              <table className="ss-table">
                <thead>
                  <tr>
                    <th>{isKo ? '완료' : 'Done'}</th>
                    <th>{isKo ? '메뉴' : 'Dish'}</th>
                    <th>{isKo ? '파트' : 'Station'}</th>
                    <th className="ss-num">{isKo ? '점심' : 'Lunch'}</th>
                    <th className="ss-num">{isKo ? '저녁' : 'Dinner'}</th>
                    <th className="ss-num">{isKo ? '중앙 합계' : 'Median'}</th>
                    <th className="ss-num">{isKo ? '안전상한 (P90)' : 'Upper (P90)'}</th>
                    <th>{isKo ? '식자재 손질량 (상한 기준)' : 'Ingredients to prep (upper)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDishes.map(dish => {
                    const done = !!completedDishes[dish.menu_item_id];
                    return (
                      <tr key={dish.menu_item_id} className={done ? 'opacity-60' : ''}>
                        <td>
                          <button
                            type="button"
                            onClick={() => toggleDishDone(dish.menu_item_id)}
                            className="ss-btn-quiet text-ink"
                            aria-label={isKo ? '완료 전환' : 'Toggle completed'}
                          >
                            {done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </button>
                        </td>
                        <td>
                          <span className={`font-bold ${done ? 'line-through' : ''}`}>
                            {isKo ? dish.name_ko : dish.name_en}
                          </span>
                          <span className="ss-chip ss-chip-ok ml-2">
                            {dish.is_main_dish ? (isKo ? '메인' : 'Main') : (isKo ? '반찬' : 'Side')}
                          </span>
                        </td>
                        <td>{stationLabel(dish.station)}</td>
                        <td className="ss-num">{dish.lunch_portions}</td>
                        <td className="ss-num">{dish.dinner_portions}</td>
                        <td className="ss-num font-bold">{dish.total_median_portions}</td>
                        <td className="ss-num font-bold">{dish.total_upper_portions}</td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {dish.ingredients.map(ing => (
                              <span key={ing.ingredient_id} className="ss-chip ss-chip-ok">
                                {isKo ? ing.name_ko : ing.name_en}: {ing.prep_qty_upper} {ing.unit}
                                {ing.yield_loss_pct > 0 ? ` (${isKo ? '손실' : 'loss'} ${ing.yield_loss_pct}%)` : ''}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Ingredient Prep Totals & FEFO First-Lot Pull Table */}
          <section className="ss-section">
            <h2 className="ss-section-title">
              {isKo
                ? '식자재별 일일 총 손질량 & FEFO 우선 출고 로트'
                : 'Ingredient daily prep totals & FEFO first-lot pull'}
            </h2>
            <p className="text-sm ss-muted mb-4">
              {isKo
                ? '소비기한이 가장 임박한 로트(예: 앞다리살 BATCH-PORK-001, 소비기한 2026-11-05)부터 먼저 출고하여 폐기를 예방합니다.'
                : 'Pull from the earliest-expiring active lot first (e.g., BATCH-PORK-001 with 소비기한 2026-11-05) to prevent waste.'}
            </p>

            <div className="ss-table-wrap">
              <table className="ss-table">
                <thead>
                  <tr>
                    <th>{isKo ? '식자재명' : 'Ingredient'}</th>
                    <th className="ss-num">{isKo ? '점심 준비량' : 'Lunch prep'}</th>
                    <th className="ss-num">{isKo ? '저녁 준비량' : 'Dinner prep'}</th>
                    <th className="ss-num">{isKo ? '중앙 합계' : 'Median total'}</th>
                    <th className="ss-num">{isKo ? '안전상한 합계 (P90)' : 'Upper total (P90)'}</th>
                    <th>{isKo ? 'FEFO 우선 출고 배치' : 'FEFO first lot'}</th>
                    <th>{isKo ? '우선 로트 소비기한' : 'First lot 소비기한'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientTotals.map(item => {
                    const isUrgent = item.fefo_lot_expiry === '2026-11-05';
                    return (
                      <tr key={item.ingredient_id} className={isUrgent ? 'ss-row-critical' : ''}>
                        <td className="font-bold">
                          {isKo ? item.name_ko : item.name_en}
                          {item.yield_loss_pct > 0 && (
                            <span className="ml-1.5 text-xs font-normal ss-muted">
                              ({isKo ? '손실률' : 'yield loss'} {item.yield_loss_pct}%)
                            </span>
                          )}
                        </td>
                        <td className="ss-num ss-muted">{item.lunch_prep_qty} {item.unit}</td>
                        <td className="ss-num ss-muted">{item.dinner_prep_qty} {item.unit}</td>
                        <td className="ss-num">{item.total_prep_qty_median} {item.unit}</td>
                        <td className="ss-num font-bold">{item.total_prep_qty_upper} {item.unit}</td>
                        <td className="tabular-nums">
                          {item.fefo_lot_batch ? (
                            <span className="ss-chip ss-chip-info">
                              {item.fefo_lot_batch} ({item.fefo_lot_qty} {item.unit})
                            </span>
                          ) : '-'}
                        </td>
                        <td className="tabular-nums">
                          {item.fefo_lot_expiry ? (
                            <span className={`ss-chip ${isUrgent ? 'ss-chip-critical' : 'ss-chip-ok'}`}>
                              {isUrgent && <ShieldAlert aria-hidden="true" />}
                              {item.fefo_lot_expiry}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
