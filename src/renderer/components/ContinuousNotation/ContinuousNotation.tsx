import { RefObject, useEffect } from 'react';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { secondsToTicks } from '../../../chart-parser/timing';
import { TimeStore } from '../../services/time-store';
import { getXForTick } from '../../services/engine/cursor-geometry';
import { useThrottledCurrentTime } from '../../hooks/useCurrentTime';
import './ContinuousNotation.css';

interface FlowCameraProps {
  /** The exact VexFlow coordinate surface, not the surrounding card. */
  notationRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  fixedPlayheadRef: RefObject<HTMLElement | null>;
  timeStore: TimeStore;
  chart: ParsedChart | null;
  renderData: RenderData[];
  delaySeconds: number;
}

export function horizontalScrollParent(
  node: HTMLElement | null,
): HTMLElement | null {
  let candidate = node?.parentElement ?? null;

  while (candidate) {
    if (candidate.classList.contains('drumroll-flow-viewport')) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

export function flowPlayheadOffset(viewportWidth: number): number {
  return Math.min(272, Math.max(160, viewportWidth * 0.22));
}

export interface FlowViewportPlayheadGeometryInput {
  viewportLeft: number;
  anchor: number;
  scoreTop: number;
  scoreBottom: number;
  beatY: number;
}

export function flowViewportPlayheadGeometry({
  viewportLeft,
  anchor,
  scoreTop,
  scoreBottom,
  beatY,
}: FlowViewportPlayheadGeometryInput) {
  return {
    left: viewportLeft + anchor,
    top: scoreTop,
    height: Math.max(1, scoreBottom - scoreTop),
    beatOffset: Math.max(0, beatY - scoreTop),
  };
}

export interface FlowFixedPlayheadGeometryInput {
  viewportLeft: number;
  /** Viewport-space origin of the playhead's actual zoomed parent. */
  surfaceLeft: number;
  /** Scroll applied later in the same frame moves the surface by this amount. */
  horizontalScrollDelta: number;
  anchor: number;
  scoreTop: number;
  scoreBottom: number;
  beatY: number;
  visualScale: number;
  verticalScale: number;
}

/**
 * Converts viewport-space camera landmarks into the local coordinate system
 * of the zoomed notation wrapper. Chromium makes a fixed descendant of a
 * zoomed ancestor move with that ancestor's scroll; without this conversion
 * the "Now" line drifts toward the left edge as playback advances.
 */
export function flowFixedPlayheadGeometry({
  viewportLeft,
  surfaceLeft,
  horizontalScrollDelta,
  anchor,
  scoreTop,
  scoreBottom,
  beatY,
  visualScale,
  verticalScale,
}: FlowFixedPlayheadGeometryInput) {
  const safeHorizontalScale = visualScale > 0 ? visualScale : 1;
  const safeVerticalScale = verticalScale > 0 ? verticalScale : 1;
  const projectedSurfaceLeft = surfaceLeft - horizontalScrollDelta;

  return {
    left: (viewportLeft + anchor - projectedSurfaceLeft) / safeHorizontalScale,
    top: scoreTop / safeVerticalScale,
    height: Math.max(1, scoreBottom - scoreTop) / safeVerticalScale,
    beatOffset: Math.max(0, beatY - scoreTop) / safeVerticalScale,
  };
}

export interface FlowScrollStep {
  nextScrollLeft: number;
  continueSettling: boolean;
}

export function flowScrollStep(
  currentScrollLeft: number,
  targetScrollLeft: number,
  reducedMotion: boolean,
): FlowScrollStep {
  const delta = targetScrollLeft - currentScrollLeft;
  const nextScrollLeft =
    currentScrollLeft + (reducedMotion ? delta : delta * 0.24);

  return {
    nextScrollLeft,
    continueSettling:
      !reducedMotion && Math.abs(targetScrollLeft - nextScrollLeft) > 0.5,
  };
}

export interface FlowLocation {
  measureIndex: number;
  barNumber: number;
  totalBars: number;
  beatIndex: number;
  beatNumber: number;
  beatCount: number;
}

interface FlowMeterBeat {
  beatIndex: number;
  beatNumber: number;
  x: number;
}

interface FlowMeterBar {
  measureIndex: number;
  barNumber: number;
  x: number;
  width: number;
  beats: FlowMeterBeat[];
  pattern?: NotationPatternRun;
}

export interface NotationPatternRun {
  startIndex: number;
  endIndex: number;
  count: number;
}

const REPEAT_CUE_GAP = 10;
const REPEAT_CUE_HEIGHT = 16;

export interface RepeatCueSegment {
  startIndex: number;
  endIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

function notationPatternKey(measure: RenderData['measure']): string {
  const duration = Math.max(1, measure.endTick - measure.startTick);

  return JSON.stringify([
    measure.timeSig,
    measure.isCompound,
    (measure.notes ?? []).map((note) => [
      (note.tick - measure.startTick) / duration,
      note.duration,
      note.dots,
      note.isRest,
      [...note.notes].sort(),
      note.tupletId ?? null,
      note.graceNotes ?? [],
      [...(note.accents ?? [])].sort(),
      [...(note.ghosts ?? [])].sort(),
    ]),
  ]);
}

export function repeatedNotationPatterns(
  renderData: RenderData[],
): NotationPatternRun[] {
  const patterns: NotationPatternRun[] = [];
  let startIndex = 0;

  while (startIndex < renderData.length) {
    const key = notationPatternKey(renderData[startIndex].measure);
    let endIndex = startIndex + 1;

    while (
      endIndex < renderData.length &&
      notationPatternKey(renderData[endIndex].measure) === key
    ) {
      endIndex += 1;
    }

    if (endIndex - startIndex > 1) {
      patterns.push({
        startIndex,
        endIndex: endIndex - 1,
        count: endIndex - startIndex,
      });
    }

    startIndex = endIndex;
  }

  return patterns;
}

export function repeatCueSegments(
  renderData: RenderData[],
  pattern: NotationPatternRun,
): RepeatCueSegment[] {
  const segments: RepeatCueSegment[] = [];
  let segment: RepeatCueSegment | undefined;

  for (
    let measureIndex = pattern.startIndex;
    measureIndex <= pattern.endIndex;
    measureIndex += 1
  ) {
    const measureData = renderData[measureIndex];

    if (!measureData) {
      continue;
    }

    const left = measureData.stave.getX();
    const width = measureData.stave.getWidth();
    const top =
      measureData.yOffset +
      measureData.stave.getY() +
      measureData.stave.getHeight() +
      REPEAT_CUE_GAP;

    if (!segment || segment.top !== top) {
      segment = {
        startIndex: measureIndex,
        endIndex: measureIndex,
        left,
        top,
        width,
        height: REPEAT_CUE_HEIGHT,
      };
      segments.push(segment);

      continue;
    }

    const right = Math.max(segment.left + segment.width, left + width);

    segment.left = Math.min(segment.left, left);
    segment.width = right - segment.left;
    segment.endIndex = measureIndex;
  }

  return segments;
}

/**
 * Natural pulse count for the visual ruler. Simple meters expose each beat;
 * compound meters group each three eighth-note subdivisions into one pulse
 * (6/8 -> two, 12/8 -> four) so the guide follows how a drummer counts it.
 */
export function flowBeatCount({
  timeSig,
  isCompound,
}: RenderData['measure']): number {
  const numerator = Math.max(1, timeSig[0]);

  return isCompound && numerator % 3 === 0 ? numerator / 3 : numerator;
}

export function flowLocationForTick(
  renderData: RenderData[],
  tick: number,
): FlowLocation | undefined {
  if (renderData.length === 0) {
    return undefined;
  }

  let measureIndex = renderData.findIndex(
    ({ measure }) => tick >= measure.startTick && tick < measure.endTick,
  );

  if (measureIndex < 0) {
    measureIndex =
      tick < renderData[0].measure.startTick ? 0 : renderData.length - 1;
  }

  const { measure } = renderData[measureIndex];
  const beatCount = flowBeatCount(measure);
  const duration = Math.max(1, measure.endTick - measure.startTick);
  const progress = Math.min(
    1 - Number.EPSILON,
    Math.max(0, (tick - measure.startTick) / duration),
  );
  const beatIndex = Math.min(beatCount - 1, Math.floor(progress * beatCount));

  return {
    measureIndex,
    barNumber: measureIndex + 1,
    totalBars: renderData.length,
    beatIndex,
    beatNumber: beatIndex + 1,
    beatCount,
  };
}

export function flowMeterBars(renderData: RenderData[]): FlowMeterBar[] {
  const patternsByMeasure = new Map<number, NotationPatternRun>();

  repeatedNotationPatterns(renderData).forEach((pattern) => {
    for (
      let measureIndex = pattern.startIndex;
      measureIndex <= pattern.endIndex;
      measureIndex += 1
    ) {
      patternsByMeasure.set(measureIndex, pattern);
    }
  });

  return renderData.map((measureData, measureIndex) => {
    const { measure, stave } = measureData;
    const beatCount = flowBeatCount(measure);
    const measureDuration = measure.endTick - measure.startTick;
    const beats = Array.from({ length: beatCount }, (_, beatIndex) => {
      const tick =
        measure.startTick + (measureDuration * beatIndex) / beatCount;

      return {
        beatIndex,
        beatNumber: beatIndex + 1,
        x: getXForTick(tick, measureData),
      };
    });

    return {
      measureIndex,
      barNumber: measureIndex + 1,
      x: stave.getX(),
      width: stave.getWidth(),
      beats,
      pattern: patternsByMeasure.get(measureIndex),
    };
  });
}

export function PatternBands({ renderData }: { renderData: RenderData[] }) {
  const patterns = repeatedNotationPatterns(renderData);

  return (
    <div className="drumroll-pattern-bands" aria-hidden="true">
      {patterns.flatMap((pattern) =>
        repeatCueSegments(renderData, pattern).map((segment, segmentIndex) => (
          <div
            key={`${pattern.startIndex}:${pattern.endIndex}:${segment.startIndex}:${segment.endIndex}`}
            className="drumroll-pattern-band"
            data-repeat-count={pattern.count}
            data-repeat-label={segmentIndex === 0 ? 'true' : undefined}
            data-repeat-start={segment.startIndex}
            data-repeat-end={segment.endIndex}
            data-testid={
              segmentIndex === 0
                ? `notation-pattern-${pattern.startIndex}-${pattern.endIndex}`
                : `notation-pattern-${pattern.startIndex}-${pattern.endIndex}-${segment.startIndex}-${segment.endIndex}`
            }
            style={{
              left: segment.left,
              top: segment.top,
              width: segment.width,
              height: segment.height,
            }}
          >
            {segmentIndex === 0 && <span>repeat ×{pattern.count}</span>}
          </div>
        )),
      )}
    </div>
  );
}

export type LoopEscapePhase = 'control' | 'lock' | 'release';

export interface LoopEscapeRunwayModel {
  barStart: number;
  barEnd: number;
  qualityProgress: number;
  requiredCleanPasses: number;
  currentSpeed: number;
  targetSpeed: number;
  retainedQuality?: boolean;
  phase?: LoopEscapePhase;
}

export function loopEscapePhase({
  qualityProgress,
  requiredCleanPasses,
  phase,
}: Pick<
  LoopEscapeRunwayModel,
  'qualityProgress' | 'requiredCleanPasses' | 'phase'
>): LoopEscapePhase {
  if (phase) {
    return phase;
  }

  if (qualityProgress >= requiredCleanPasses) {
    return 'release';
  }

  return qualityProgress >= 1 ? 'lock' : 'control';
}

export function loopEscapeEnergy({
  qualityProgress,
  requiredCleanPasses,
}: Pick<
  LoopEscapeRunwayModel,
  'qualityProgress' | 'requiredCleanPasses'
>): number {
  if (requiredCleanPasses <= 0) {
    return 1;
  }

  if (qualityProgress <= 0) {
    return 0.18;
  }

  if (qualityProgress < 1) {
    return 0.18 + qualityProgress * 0.54;
  }

  return Math.min(
    1,
    0.72 +
      ((qualityProgress - 1) * 0.28) / Math.max(1, requiredCleanPasses - 1),
  );
}

export function LoopEscapeRunway({
  renderData,
  model,
}: {
  renderData: RenderData[];
  model: LoopEscapeRunwayModel;
}) {
  const start = renderData[model.barStart - 1];
  const end = renderData[model.barEnd - 1];

  if (!start || !end) {
    return null;
  }

  const left = start.stave.getX();
  const width = Math.max(
    1,
    end.stave.getX() + end.stave.getWidth() - start.stave.getX(),
  );
  const energy = loopEscapeEnergy(model);
  const phase = loopEscapePhase(model);
  const speed = `${model.currentSpeed.toFixed(
    1,
  )}× → ${model.targetSpeed.toFixed(1)}×`;
  const label = `Loop escape, bars ${model.barStart} through ${
    model.barEnd
  }: ${phase}; ${model.qualityProgress.toFixed(1)} of ${
    model.requiredCleanPasses
  } clean passes, ${speed}${
    model.retainedQuality ? '; near-clean quality retained' : ''
  }`;

  return (
    <section
      className="drumroll-loop-escape"
      data-testid="loop-escape-runway"
      data-phase={phase}
      data-retained-quality={model.retainedQuality || undefined}
      style={{ left, width }}
      aria-label={label}
    >
      <svg
        className="drumroll-loop-escape__ribbon"
        viewBox="0 0 1000 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="loop-escape-energy" x1="0" x2="1">
            <stop offset="0" stopColor="#63d5ff" />
            <stop offset="0.54" stopColor="#8a74ff" />
            <stop offset="1" stopColor="#d48cff" />
          </linearGradient>
        </defs>
        <path
          className="drumroll-loop-escape__trace"
          d="M0 37 C58 20 97 52 154 35 S253 18 311 34 S407 52 468 31 S563 16 621 34 S716 51 775 30 S896 16 1000 32"
          pathLength="100"
        />
        <path
          className="drumroll-loop-escape__energy"
          d="M0 37 C58 20 97 52 154 35 S253 18 311 34 S407 52 468 31 S563 16 621 34 S716 51 775 30 S896 16 1000 32"
          pathLength="100"
          style={{ strokeDasharray: `${energy * 100} 100` }}
        />
      </svg>
      <span className="drumroll-loop-escape__anchor drumroll-loop-escape__anchor--control">
        <span data-acquired={energy > 0} />
        <b>Control</b>
      </span>
      <span className="drumroll-loop-escape__anchor drumroll-loop-escape__anchor--lock">
        <span data-acquired={energy >= 0.5} />
        <b>Lock</b>
      </span>
      <span className="drumroll-loop-escape__release">Release</span>
      <span className="drumroll-loop-escape__telemetry">
        <b>
          {model.qualityProgress.toFixed(1)} / {model.requiredCleanPasses}
        </b>
        <span>{speed}</span>
      </span>
      {model.retainedQuality && (
        <span className="drumroll-loop-escape__retained">Quality retained</span>
      )}
    </section>
  );
}

export function FlowMeter({ renderData }: { renderData: RenderData[] }) {
  const bars = flowMeterBars(renderData);

  return (
    <div className="drumroll-flow-meter" aria-hidden="true">
      {bars.map((bar) => (
        <div
          key={bar.measureIndex}
          className="drumroll-flow-meter__bar"
          data-flow-bar={bar.measureIndex}
          data-flow-repeat={bar.pattern?.count}
          style={{ left: bar.x, width: bar.width }}
        >
          <span className="drumroll-flow-meter__bar-label">
            Bar {bar.barNumber}
          </span>
          {bar.beats.map((beat) => (
            <span
              key={beat.beatIndex}
              className="drumroll-flow-meter__beat"
              data-flow-beat={`${bar.measureIndex}:${beat.beatIndex}`}
              style={{ left: beat.x - bar.x }}
            >
              <span>{beat.beatNumber}</span>
            </span>
          ))}
        </div>
      ))}
      {bars.length > 0 && (
        <span
          className="drumroll-flow-meter__end"
          style={{ left: bars.at(-1)!.x + bars.at(-1)!.width }}
        />
      )}
    </div>
  );
}

interface NotationLocationReadoutProps {
  timeStore: TimeStore;
  chart: ParsedChart;
  renderData: RenderData[];
  delaySeconds: number;
}

/**
 * A mode-independent location readout. Flow carries the same information on
 * its fixed playhead; Classic uses this compact fixed landmark so the player
 * never has to infer the current system from page position.
 */
export function NotationLocationReadout({
  timeStore,
  chart,
  renderData,
  delaySeconds,
}: NotationLocationReadoutProps) {
  const currentTime = useThrottledCurrentTime(timeStore);
  const tick = secondsToTicks(
    currentTime - delaySeconds,
    chart.resolution,
    chart.tempos,
  );
  const location = flowLocationForTick(renderData, tick);

  if (!location) {
    return null;
  }

  const accessibleLabel = `Bar ${location.barNumber} of ${location.totalBars}, beat ${location.beatNumber} of ${location.beatCount}`;

  return (
    <div
      className="drumroll-notation-location"
      data-testid="notation-location"
      data-location-key={`${location.measureIndex}:${location.beatIndex}`}
      aria-label={accessibleLabel}
    >
      <span className="drumroll-notation-location__bar">
        Bar <strong>{location.barNumber}</strong>
        <span aria-hidden="true"> / {location.totalBars}</span>
      </span>
      <span
        className="drumroll-notation-location__divider"
        aria-hidden="true"
      />
      <span className="drumroll-notation-location__beat">
        Beat <strong>{location.beatNumber}</strong>
        <span aria-hidden="true"> / {location.beatCount}</span>
      </span>
    </div>
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
  stageRef,
  fixedPlayheadRef,
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
    let raf: number | undefined;
    let disposed = false;
    let lastLocationKey = '';
    const renderCamera = () => {
      raf = undefined;

      if (disposed) {
        return;
      }

      const notation = notationRef.current;
      const viewport = horizontalScrollParent(notation);
      const stage = stageRef.current;
      const fixedPlayhead = fixedPlayheadRef.current;
      const fixedSurface = fixedPlayhead?.parentElement;

      if (!notation || !viewport || !stage || !fixedPlayhead || !fixedSurface) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const notationRect = notation.getBoundingClientRect();
      const anchor = flowPlayheadOffset(viewport.clientWidth);
      const scoreTop = Math.max(stageRect.top + 32, notationRect.top - 20);
      const scoreBottom = Math.min(
        stageRect.bottom - 20,
        notationRect.bottom + 48,
      );
      const tick = secondsToTicks(
        timeStore.get() - delaySeconds,
        chart.resolution,
        chart.tempos,
      );
      const location = flowLocationForTick(renderData, tick);

      if (!location) {
        fixedPlayhead.style.display = 'none';

        return;
      }

      const measureData = renderData[location.measureIndex];
      const locationKey = `${location.measureIndex}:${location.beatIndex}`;

      if (locationKey !== lastLocationKey) {
        notation
          .querySelectorAll('[data-flow-current="true"]')
          .forEach((element) => element.removeAttribute('data-flow-current'));
        notation
          .querySelector(`[data-flow-bar="${location.measureIndex}"]`)
          ?.setAttribute('data-flow-current', 'true');
        notation
          .querySelector(
            `[data-flow-beat="${location.measureIndex}:${location.beatIndex}"]`,
          )
          ?.setAttribute('data-flow-current', 'true');
        lastLocationKey = locationKey;
      }

      const locationEl = fixedPlayhead.querySelector<HTMLElement>(
        '[data-flow-location]',
      );

      if (locationEl) {
        locationEl.textContent = `Bar ${location.barNumber} / ${location.totalBars} · Beat ${location.beatNumber} / ${location.beatCount}`;
      }

      const x = getXForTick(tick, measureData);
      // getXForTick is already absolute within the rendered VexFlow system.
      // Convert only the score wrapper itself into the viewport's scroll
      // coordinate space — adding a stave/measure X again would drift the
      // camera farther right on every measure.
      const visualScale =
        notation.offsetWidth > 0
          ? notationRect.width / notation.offsetWidth
          : 1;
      const verticalScale =
        notation.offsetHeight > 0
          ? notationRect.height / notation.offsetHeight
          : visualScale;
      const beatY =
        notationRect.top +
        (measureData.yOffset +
          measureData.stave.getY() +
          measureData.stave.getHeight() / 2) *
          verticalScale;
      const scoreLeft =
        notationRect.left - viewportRect.left + viewport.scrollLeft;
      const maxScrollLeft = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );
      const target = Math.min(
        maxScrollLeft,
        Math.max(0, scoreLeft + x * visualScale - anchor),
      );
      const delta = target - viewport.scrollLeft;
      const shouldScroll =
        viewport.scrollWidth > viewport.clientWidth && Math.abs(delta) > 0.5;
      const scrollStep = shouldScroll
        ? flowScrollStep(viewport.scrollLeft, target, reducedMotion)
        : undefined;
      const horizontalScrollDelta = scrollStep
        ? scrollStep.nextScrollLeft - viewport.scrollLeft
        : 0;
      const fixedGeometry =
        fixedSurface === document.body
          ? flowViewportPlayheadGeometry({
              viewportLeft: viewportRect.left,
              anchor,
              scoreTop,
              scoreBottom,
              beatY,
            })
          : (() => {
              const fixedSurfaceRect = fixedSurface.getBoundingClientRect();
              const fixedHorizontalScale =
                fixedSurface.offsetWidth > 0
                  ? fixedSurfaceRect.width / fixedSurface.offsetWidth
                  : visualScale;
              const fixedVerticalScale =
                fixedSurface.offsetHeight > 0
                  ? fixedSurfaceRect.height / fixedSurface.offsetHeight
                  : verticalScale;

              return flowFixedPlayheadGeometry({
                viewportLeft: viewportRect.left,
                surfaceLeft: fixedSurfaceRect.left,
                horizontalScrollDelta,
                anchor,
                scoreTop,
                scoreBottom,
                beatY,
                visualScale: fixedHorizontalScale,
                verticalScale: fixedVerticalScale,
              });
            })();

      viewport.style.setProperty('--flow-playhead-px', `${anchor}px`);
      fixedPlayhead.style.left = `${fixedGeometry.left}px`;
      fixedPlayhead.style.top = `${fixedGeometry.top}px`;
      fixedPlayhead.style.height = `${fixedGeometry.height}px`;
      fixedPlayhead.style.setProperty(
        '--flow-beat-y',
        `${fixedGeometry.beatOffset}px`,
      );
      fixedPlayhead.style.display = '';

      // The interpolation makes a single existing engine frame feel fluid
      // without owning a second animation loop. Tiny changes are ignored to
      // avoid sub-pixel scroll churn on a parked playhead.
      if (scrollStep) {
        viewport.scrollLeft = scrollStep.nextScrollLeft;

        // A paused seek or a Classic -> Flow switch emits only one time-store
        // update. Keep settling the camera until the fixed playhead and the
        // labelled bar agree; playback frames will naturally coalesce with
        // this same requestAnimationFrame slot.
        if (scrollStep.continueSettling) {
          raf = requestAnimationFrame(renderCamera);
        }
      }
    };
    const unsubscribe = timeStore.subscribe(() => {
      if (raf === undefined) {
        raf = requestAnimationFrame(renderCamera);
      }
    });
    const handleResize = () => {
      if (raf === undefined) {
        raf = requestAnimationFrame(renderCamera);
      }
    };

    window.addEventListener('resize', handleResize);
    raf = requestAnimationFrame(renderCamera);

    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener('resize', handleResize);

      if (raf !== undefined) {
        cancelAnimationFrame(raf);
      }
    };
  }, [
    chart,
    delaySeconds,
    fixedPlayheadRef,
    notationRef,
    renderData,
    stageRef,
    timeStore,
  ]);

  return null;
}
