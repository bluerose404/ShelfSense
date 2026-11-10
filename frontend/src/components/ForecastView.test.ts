import { describe, it, expect } from 'vitest';
import { aggregateDailyForecastTotals, type ForecastItem } from './ForecastView';

describe('aggregateDailyForecastTotals (Audit Item 8 - Non-Double-Counted Stack)', () => {
  const sampleItems: ForecastItem[] = [
    {
      target_date: '2026-11-04',
      day_name: 'Wed',
      menu_code: 'MENU-KIMCHI-JJIGAE',
      menu_name_ko: '김치찌개',
      menu_name_en: 'Kimchi Jjigae',
      daypart: 'lunch',
      median_portions: 40,
      upper_portions: 46,
      projected_revenue_krw: 360000,
      selected_model: 'ml',
      baseline_wape: 0.14,
      model_wape: 0.08,
      fva: 0.42,
    },
    {
      target_date: '2026-11-04',
      day_name: 'Wed',
      menu_code: 'MENU-KIMCHI-JJIGAE',
      menu_name_ko: '김치찌개',
      menu_name_en: 'Kimchi Jjigae',
      daypart: 'dinner',
      median_portions: 50,
      upper_portions: 58,
      projected_revenue_krw: 450000,
      selected_model: 'ml',
      baseline_wape: 0.14,
      model_wape: 0.10,
      fva: 0.28,
    },
  ];

  it('computes upperDelta as (upperTotal - medianCovers) so stacked height equals upperTotal with no double counting', () => {
    const totals = aggregateDailyForecastTotals(sampleItems, 'all');
    expect(totals).toHaveLength(1);
    const row = totals[0];
    expect(row.date).toBe('11-04');
    expect(row.medianCovers).toBe(90); // 40 + 50
    expect(row.upperTotal).toBe(104);  // 46 + 58
    expect(row.upperDelta).toBe(14);   // 104 - 90 = 14
    // Stacked bar total (medianCovers + upperDelta) must equal upperTotal, NOT medianCovers + upperTotal
    expect(row.medianCovers + row.upperDelta).toBe(row.upperTotal);
    expect(row.revenue).toBe(810000);
  });

  it('filters by daypart and preserves non-negative upperDelta', () => {
    const lunchOnly = aggregateDailyForecastTotals(sampleItems, 'lunch');
    expect(lunchOnly).toHaveLength(1);
    expect(lunchOnly[0].medianCovers).toBe(40);
    expect(lunchOnly[0].upperDelta).toBe(6);
    expect(lunchOnly[0].medianCovers + lunchOnly[0].upperDelta).toBe(46);
  });
});
