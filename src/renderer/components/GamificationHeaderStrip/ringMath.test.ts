import { describe, expect, it } from 'vitest';
import { circleCircumference, ringDashOffset, ringProgress } from './ringMath';

describe('ringProgress', () => {
  it('is 0 with no progress', () => {
    expect(ringProgress(0, 50)).toBe(0);
  });

  it('is a fraction partway to goal', () => {
    expect(ringProgress(25, 50)).toBe(0.5);
  });

  it('clamps at 1 once current exceeds goal', () => {
    expect(ringProgress(80, 50)).toBe(1);
  });

  it('treats any positive current as full when goal is 0', () => {
    expect(ringProgress(1, 0)).toBe(1);
    expect(ringProgress(0, 0)).toBe(0);
  });

  it('never goes negative for a negative current', () => {
    expect(ringProgress(-10, 50)).toBe(0);
  });
});

describe('circleCircumference', () => {
  it('matches 2*pi*r', () => {
    expect(circleCircumference(10)).toBeCloseTo(62.83185, 4);
  });
});

describe('ringDashOffset', () => {
  it('is 0 (fully drawn) at progress 1', () => {
    expect(ringDashOffset(1, 100)).toBe(0);
  });

  it('equals the full circumference (fully hidden) at progress 0', () => {
    expect(ringDashOffset(0, 100)).toBe(100);
  });

  it('is half the circumference at half progress', () => {
    expect(ringDashOffset(0.5, 100)).toBe(50);
  });
});
