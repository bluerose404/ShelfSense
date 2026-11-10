import { describe, it, expect } from 'vitest';
import {
  DEMO_SCAN_PRESETS,
  computeOrderDiscrepancy,
  sortLotsFefo,
  calculateSpotVariancePreview,
  type LotItem,
} from './InventoryScanView';

describe('InventoryScanView M3 helpers & presets', () => {
  it('includes 3 GS1 2D payloads and 2 unknown barcodes in DEMO_SCAN_PRESETS', () => {
    const gs1Group = DEMO_SCAN_PRESETS.find(g => g.category.includes('GS1 2D'));
    const unknownGroup = DEMO_SCAN_PRESETS.find(g => g.category.includes('Unknown'));

    expect(gs1Group?.items).toHaveLength(3);
    expect(unknownGroup?.items).toHaveLength(2);
    expect(unknownGroup?.items.map(i => i.payload)).toEqual([
      '8809999900016',
      '8809999900023',
    ]);
  });

  it('detects order receiving quantity discrepancies accurately', () => {
    const order = {
      id: 10,
      ingredient_id: 1,
      recommended_qty: 25,
      approved_qty: 25,
      expected_delivery_date: '2026-11-04',
    };

    const exact = computeOrderDiscrepancy(25, order);
    expect(exact.hasDiscrepancy).toBe(false);
    expect(exact.diff).toBe(0);

    const short = computeOrderDiscrepancy(20, order);
    expect(short.hasDiscrepancy).toBe(true);
    expect(short.expectedQty).toBe(25);
    expect(short.diff).toBe(-5);
  });

  it('sorts inventory lots strictly in FEFO order (expiry_date asc, then received_date asc)', () => {
    const sampleLots: LotItem[] = [
      {
        id: 1,
        ingredient_id: 1,
        ingredient_code: 'ING-PORK',
        ingredient_name_ko: '돼지 앞다리살',
        ingredient_name_en: 'Pork Shoulder',
        unit: 'kg',
        product_name_ko: null,
        product_name_en: null,
        quantity: 2.0,
        original_quantity: 5.0,
        unit_cost_krw: 11000,
        received_date: '2026-11-02',
        expiry_date: '2026-11-09',
        days_until_expiry: 5,
        expiry_status: 'warning',
        source: 'auto',
        status: 'active',
        batch_number: 'BATCH-02',
      },
      {
        id: 2,
        ingredient_id: 1,
        ingredient_code: 'ING-PORK',
        ingredient_name_ko: '돼지 앞다리살',
        ingredient_name_en: 'Pork Shoulder',
        unit: 'kg',
        product_name_ko: null,
        product_name_en: null,
        quantity: 4.0,
        original_quantity: 5.0,
        unit_cost_krw: 11000,
        received_date: '2026-10-29',
        expiry_date: '2026-11-05',
        days_until_expiry: 1,
        expiry_status: 'urgent',
        source: 'manual',
        status: 'active',
        batch_number: 'BATCH-01',
      },
    ];

    const sorted = sortLotsFefo(sampleLots);
    expect(sorted.map(l => l.id)).toEqual([2, 1]);
    expect(sorted[0].expiry_date).toBe('2026-11-05');
  });

  it('computes physical spot-count variance quantity and KRW value accurately', () => {
    const v = calculateSpotVariancePreview(6.0, 5.2, 11000);
    expect(v.varianceQty).toBe(-0.8);
    expect(v.varianceKrw).toBe(-8800);
  });
});
