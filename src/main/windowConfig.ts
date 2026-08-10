/**
 * Home and Journey are distance-readable, single-canvas surfaces. Keep the
 * Electron content area inside their supported layout envelope instead of
 * allowing an arbitrarily small window to crop controls without a scrollbar.
 */
export const MAIN_WINDOW_SIZE = {
  width: 1366,
  height: 768,
  minWidth: 1024,
  minHeight: 700,
} as const;
