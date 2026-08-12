/**
 * Pure geometry for the streak-flame progress ring. Kept separate from the
 * SVG markup (mirrors `PracticeStats/AccuracySparkline.tsx`'s
 * `sparklineCoords` split) so the math is testable without rendering.
 */

/** `current`/`goal` clamped to a 0..1 fill fraction. A `goal` of 0 treats
 * any positive `current` as "full" rather than dividing by zero. */
export function ringProgress(current: number, goal: number): number {
  if (goal <= 0) {
    return current > 0 ? 1 : 0;
  }

  return Math.min(1, Math.max(0, current / goal));
}

export function circleCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

/** SVG `stroke-dasharray` trick: the ring is one full-circumference dash,
 * and `stroke-dashoffset` hides `(1 - progress)` of it. */
export function ringDashOffset(
  progress: number,
  circumference: number,
): number {
  return circumference * (1 - progress);
}
