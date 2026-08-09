import { RefObject, useEffect } from 'react';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { secondsToTicks } from '../../../chart-parser/timing';
import { TimeStore } from '../../services/time-store';
import { getXForTick } from '../../services/engine/cursor-geometry';
import './ContinuousNotation.css';

interface FlowCameraProps {
  /** The SheetMusic wrapper, not a second rendering surface. */
  notationRef: RefObject<HTMLElement | null>;
  timeStore: TimeStore;
  chart: ParsedChart | null;
  renderData: RenderData[];
  delaySeconds: number;
}

function horizontalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let candidate = node?.parentElement ?? null;

  while (candidate) {
    const style = getComputedStyle(candidate);
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      candidate.scrollWidth > candidate.clientWidth;

    if (canScrollX) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

function dataForTick(renderData: RenderData[], tick: number) {
  return renderData.find(
    ({ measure }) => tick >= measure.startTick && tick < measure.endTick,
  );
}

/**
 * A camera only: playback remains owned by Engine/Transport. The component
 * listens to the engine's existing TimeStore and coalesces those updates into
 * a frame for scrolling the one-row Flow score. There is no independent
 * scheduler, timebase, or note judgement here.
 */
export function ContinuousNotationCamera({
  notationRef,
  timeStore,
  chart,
  renderData,
  delaySeconds,
}: FlowCameraProps) {
  useEffect(() => {
    if (!chart || renderData.length === 0) {
      return;
    }

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    // In reduced-motion mode the exact cursor still updates through
    // GameRenderer; only the continuous camera pan is suppressed.
    if (reducedMotion) {
      return;
    }

    let raf: number | undefined;
    let disposed = false;
    const renderCamera = () => {
      raf = undefined;

      if (disposed) {
        return;
      }

      const notation = notationRef.current;
      const viewport = horizontalScrollParent(notation);
      const tick = secondsToTicks(
        timeStore.get() - delaySeconds,
        chart.resolution,
        chart.tempos,
      );
      const measureData = dataForTick(renderData, tick);

      if (!notation || !viewport || !measureData) {
        return;
      }

      const x = getXForTick(tick, measureData);
      // getXForTick is already absolute within the rendered VexFlow system.
      // Convert only the score wrapper itself into the viewport's scroll
      // coordinate space — adding a stave/measure X again would drift the
      // camera farther right on every measure.
      const notationRect = notation.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const visualScale =
        notation.offsetWidth > 0
          ? notationRect.width / notation.offsetWidth
          : 1;
      const scoreLeft =
        notationRect.left - viewportRect.left + viewport.scrollLeft;
      const target = Math.max(
        0,
        scoreLeft + x * visualScale - viewport.clientWidth * 0.5,
      );
      const delta = target - viewport.scrollLeft;

      // The interpolation makes a single existing engine frame feel fluid
      // without owning a second animation loop. Tiny changes are ignored to
      // avoid sub-pixel scroll churn on a parked playhead.
      if (Math.abs(delta) > 0.5) {
        viewport.scrollLeft += delta * 0.24;
      }
    };
    const unsubscribe = timeStore.subscribe(() => {
      if (raf === undefined) {
        raf = requestAnimationFrame(renderCamera);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();

      if (raf !== undefined) {
        cancelAnimationFrame(raf);
      }
    };
  }, [chart, delaySeconds, notationRef, renderData, timeStore]);

  return null;
}
