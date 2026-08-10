import { describe, expect, it } from 'vitest';
import { MAIN_WINDOW_SIZE } from './windowConfig';

describe('main window layout contract', () => {
  it('keeps the no-scroll learning canvases inside their supported viewport', () => {
    expect(MAIN_WINDOW_SIZE).toEqual({
      width: 1366,
      height: 768,
      minWidth: 1024,
      minHeight: 700,
    });
    expect(MAIN_WINDOW_SIZE.minWidth).toBeLessThanOrEqual(
      MAIN_WINDOW_SIZE.width,
    );
    expect(MAIN_WINDOW_SIZE.minHeight).toBeLessThanOrEqual(
      MAIN_WINDOW_SIZE.height,
    );
  });
});
