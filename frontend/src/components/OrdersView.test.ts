import { describe, it, expect } from 'vitest';
import { isAutonomyLevelSelectable } from './OrdersView';

describe('OrdersView M5 Human-in-the-Loop Autonomy Guard', () => {
  it('allows only Autonomy Levels 1 and 2, and disables Level 3', () => {
    expect(isAutonomyLevelSelectable(1)).toBe(true);
    expect(isAutonomyLevelSelectable(2)).toBe(true);
    expect(isAutonomyLevelSelectable(3)).toBe(false);
    expect(isAutonomyLevelSelectable(0)).toBe(false);
  });
});
