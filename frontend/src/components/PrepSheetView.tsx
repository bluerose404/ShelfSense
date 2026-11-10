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

  return (
    <div className="space-y-6">
      {/* Header & Station Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isKo ? `일일 주방 프랩 시트 (${targetDate} 수요일)` : `Daily Kitchen Prep Sheet (${targetDate} Wed)`}
          </h2>
          <p className="text-sm text-gray-500">
            {isKo
              ? '점심·저녁 예측 식수, 손실률(Yield Loss), FEFO 우선 소진 로트(소비기한 임박순)를 반영한 조리 준비표'
              : 'Station prep targets incorporating lunch/dinner forecast covers, yield loss %, and FEFO first-lot pull guidance'}
          </p>
        </div>

        <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
          {(['all', 'kitchen', 'prep', 'grill'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStationFilter(st)}
              className={`px-3 py-1.5 rounded-md transition ${
                stationFilter === st ? 'bg-white shadow text-teal-800 font-semibold' : 'text-gray-600'
              }`}
            >
              {st === 'all'
                ? isKo ? '전체 파트' : 'All Stations'
                : st === 'kitchen'
                ? isKo ? '조리화구 (Kitchen)' : 'Kitchen'
                : st === 'prep'
                ? isKo ? '전처리/반찬 (Prep)' : 'Prep'
                : isKo ? '구이 (Grill)' : 'Grill'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-400">
          {isKo ? '일일 프랩 시트 생성 중...' : 'Generating daily prep sheet...'}
        </div>
      ) : (
        <>
          {/* Dish-Level Prep Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDishes.map(dish => {
              const done = !!completedDishes[dish.menu_item_id];
              return (
                <div
                  key={dish.menu_item_id}
                  className={`p-4 rounded-xl border transition shadow-sm ${
                    done ? 'bg-gray-50 border-gray-200 opacity-75' : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <button
                        type="button"
                        onClick={() => toggleDishDone(dish.menu_item_id)}
                        className="text-teal-700 hover:text-teal-900"
                      >
                        {done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-400" />}
                      </button>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`font-bold text-sm ${done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {isKo ? dish.name_ko : dish.name_en}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-gray-100 text-gray-700 uppercase">
                            {dish.station}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-teal-50 text-teal-800">
                            {dish.is_main_dish ? (isKo ? '메인 메뉴' : 'Main') : (isKo ? '사이드/반찬' : 'Side')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {isKo
                            ? `점심 ${dish.lunch_portions}식 + 저녁 ${dish.dinner_portions}식 = 중앙 ${dish.total_median_portions}식 (안전상한 ${dish.total_upper_portions}식)`
                            : `Lunch ${dish.lunch_portions} + Dinner ${dish.dinner_portions} = Median ${dish.total_median_portions} (Upper ${dish.total_upper_portions})`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-1.5">
                    {dish.ingredients.map(ing => (
                      <span
                        key={ing.ingredient_id}
                        className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700"
                      >
                        {isKo ? ing.name_ko : ing.name_en}:{' '}
                        <strong className="text-teal-800">{ing.prep_qty_upper}{ing.unit}</strong>
                        {ing.yield_loss_pct > 0 ? ` (손실 ${ing.yield_loss_pct}%)` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ingredient Prep Totals & FEFO First-Lot Pull Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800 text-sm">
                {isKo
                  ? '식자재별 일일 총 손질량 & FEFO 선입선출 우선 사용 로트 지시서'
                  : 'Ingredient Daily Prep Totals & FEFO First-Lot Pull Instructions'}
              </h3>
              <p className="text-xs text-gray-500">
                {isKo
                  ? '소비기한이 가장 임박한 로트(예: 앞다리살 BATCH-PORK-001, 소비기한 11-05)부터 우선 출고하여 폐기를 예방합니다.'
                  : 'Pulls from the earliest-expiring active lot first (e.g., BATCH-PORK-001 expiring 11-05) to prevent waste.'}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                    <th className="py-3 px-4">{isKo ? '식자재명' : 'Ingredient'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '점심 준비량' : 'Lunch Prep'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '저녁 준비량' : 'Dinner Prep'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '일일 중앙 합계' : 'Median Total'}</th>
                    <th className="py-3 px-4 text-right">{isKo ? '안전상한 합계 (P90)' : 'Upper Total (P90)'}</th>
                    <th className="py-3 px-4">{isKo ? 'FEFO 우선 출고 배치' : 'FEFO First Lot'}</th>
                    <th className="py-3 px-4">{isKo ? '우선 로트 소비기한' : 'First Lot 소비기한'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ingredientTotals.map(item => {
                    const isUrgent = item.fefo_lot_expiry === '2026-11-05';
                    return (
                      <tr key={item.ingredient_id} className={isUrgent ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          {isKo ? item.name_ko : item.name_en}
                          {item.yield_loss_pct > 0 && (
                            <span className="ml-1.5 text-[11px] font-normal text-gray-500">
                              (손실률 {item.yield_loss_pct}%)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-gray-600">
                          {item.lunch_prep_qty} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-gray-600">
                          {item.dinner_prep_qty} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-gray-800">
                          {item.total_prep_qty_median} {item.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                          {item.total_prep_qty_upper} {item.unit}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-gray-700">
                          {item.fefo_lot_batch || '-'} ({item.fefo_lot_qty} {item.unit})
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold inline-flex items-center ${
                              isUrgent
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {isUrgent && <ShieldAlert className="w-3 h-3 mr-1" />}
                            {item.fefo_lot_expiry || '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
