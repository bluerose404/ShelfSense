import { describe, it, expect } from 'vitest';
import { evaluateCanonicalLaborFixture } from './LaborView';

describe('LaborView M6 Canonical Labor Budget & Peak Staffing Fixture', () => {
  it('computes 1,200,000 budget, 1,104,000 (27.6%) draft, and 4 peak front staff', () => {
    const res = evaluateCanonicalLaborFixture(4000000, 30, 92, 12000, 48, 14);
    expect(res.budgetKrw).toBe(1200000);
    expect(res.draftCostKrw).toBe(1104000);
    expect(res.draftPct).toBe(27.6);
    expect(res.peakFrontStaff).toBe(4);
  });
});
