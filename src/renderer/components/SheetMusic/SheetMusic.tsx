import {
  PointerEvent as ReactPointerEvent,
  MouseEvent,
  RefObject,
  createRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../cn';
import { Measure, RenderData } from '../../../chart-parser/types';
import { ParsedChart } from '../../../chart-parser/types';
import { SheetMusicLayout } from '../../../chart-parser/renderer';
import { Engine } from '../../services/engine';
import { TimeStore } from '../../services/time-store';
import { Song } from '../../../types';
import { GameMode, PracticeRange } from '../../types';
import { getScrollParent } from '../../services/engine/helpers';
import {
  autoScrollSpeed,
  flowAutoZoomMultiplier,
  FLOW_AUTO_ZOOM_MIN_MULTIPLIER,
} from './helpers';
import {
  ContinuousNotationCamera,
  FlowMeter,
  LoopEscapeRunway,
  LoopEscapeRunwayModel,
  PatternBands,
} from '../ContinuousNotation';
import {
  NotationGlossary,
  useNotationGlossaryIntent,
} from '../NotationGlossary';

const LOOP_DRAG_THRESHOLD_PX = 12;

export interface SheetMusicProps {
  engine: Engine | undefined;
  songData: Song;
  renderData: RenderData[];
  vexflowContainerRef: RefObject<HTMLDivElement | null>;
  isDev: boolean;
  gameMode?: GameMode;
  practiceRange?: PracticeRange;
  focusIndex?: number;
  isLooping?: boolean;
  onPracticeRangeChange?: (range?: PracticeRange) => void;
  onLoopRangeSelect?: (range: PracticeRange) => void;
  onClearLoop?: () => void;
  onSelectMeasure: (measure: Measure, event: MouseEvent) => void;
  zoom: number;
  layout?: SheetMusicLayout;
  timeStore?: TimeStore;
  chart?: ParsedChart | null;
  delaySeconds?: number;
  loopEscape?: LoopEscapeRunwayModel;
}

export function SheetMusic({
  engine,
  songData,
  renderData,
  vexflowContainerRef,
  isDev,
  gameMode,
  practiceRange,
  focusIndex,
  isLooping,
  onPracticeRangeChange,
  onLoopRangeSelect,
  onClearLoop,
  onSelectMeasure,
  zoom,
  layout = 'classic',
  timeStore,
  chart,
  delaySeconds = 0,
  loopEscape,
}: SheetMusicProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const flowStageRef = useRef<HTMLDivElement>(null);
  const fixedFlowPlayheadRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useMemo(
    () => renderData.map(() => createRef<HTMLDivElement>()),
    [renderData],
  );
  const isSelectable = gameMode === 'practice';
  const dragAnchorRef = useRef<number | undefined>(undefined);
  const dragEndRef = useRef<number | undefined>(undefined);
  const dragStartRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const loopDragActiveRef = useRef(false);
  const {
    intent: notationGlossaryIntent,
    summon: summonNotation,
    dismiss: dismissNotation,
  } = useNotationGlossaryIntent();
  // The scroll container a selection drag is happening over, cached for
  // the lifetime of the drag (resolved once on mousedown rather than on
  // every mousemove/wheel event) - see the wheel/auto-scroll effect below.
  const scrollContainerRef = useRef<HTMLElement | undefined>(undefined);
  const autoScrollSpeedRef = useRef(0);
  const autoScrollFrameRef = useRef<number | undefined>(undefined);
  const selectLoopRange = useCallback(
    (range: PracticeRange) => {
      if (onLoopRangeSelect) {
        onLoopRangeSelect(range);

        return;
      }

      onPracticeRangeChange?.(range);
    },
    [onLoopRangeSelect, onPracticeRangeChange],
  );
  const handleMeasureMouseDown = useCallback(
    (index: number, event: { clientX: number; clientY: number }) => {
      if (!isSelectable || dragAnchorRef.current !== undefined) {
        return;
      }

      dragAnchorRef.current = index;
      dragEndRef.current = index;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      loopDragActiveRef.current = false;
      scrollContainerRef.current = getScrollParent(
        wrapperRef.current ?? undefined,
      );
    },
    [isSelectable],
  );
  const handleMeasureDrag = useCallback(
    (index: number, event: { clientX: number; clientY: number }) => {
      const anchor = dragAnchorRef.current;
      const start = dragStartRef.current;

      if (anchor === undefined || !start) {
        return;
      }

      if (
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >=
        LOOP_DRAG_THRESHOLD_PX
      ) {
        loopDragActiveRef.current = index !== anchor;
        dragEndRef.current = index;
      }
    },
    [],
  );
  const finishMeasureDrag = useCallback(
    (commit: boolean) => {
      const anchor = dragAnchorRef.current;
      const end = dragEndRef.current;

      if (
        commit &&
        loopDragActiveRef.current &&
        anchor !== undefined &&
        end !== undefined
      ) {
        selectLoopRange({
          start: Math.min(anchor, end),
          end: Math.max(anchor, end),
        });
      }

      dragAnchorRef.current = undefined;
      dragEndRef.current = undefined;
      dragStartRef.current = undefined;
      loopDragActiveRef.current = false;
      scrollContainerRef.current = undefined;
      autoScrollSpeedRef.current = 0;
    },
    [selectLoopRange],
  );
  const measureIndexAtPoint = useCallback(
    (clientX: number, clientY: number): number | undefined => {
      const index = highlightsRef.findIndex((ref) => {
        const element = ref.current;

        if (!element) {
          return false;
        }

        const rect = element.getBoundingClientRect();

        return (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        );
      });

      return index === -1 ? undefined : index;
    },
    [highlightsRef],
  );
  const handleScorePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-loop-clear]')
      ) {
        return;
      }

      if (event.altKey) {
        summonNotation(event.target, event.clientX, event.clientY);
        event.preventDefault();

        return;
      }

      dismissNotation();

      const index = measureIndexAtPoint(event.clientX, event.clientY);

      if (index === undefined) {
        return;
      }

      handleMeasureMouseDown(index, event);
    },
    [
      dismissNotation,
      handleMeasureMouseDown,
      measureIndexAtPoint,
      summonNotation,
    ],
  );
  const handleScorePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const index = measureIndexAtPoint(event.clientX, event.clientY);

      if (dragAnchorRef.current !== undefined) {
        dismissNotation();

        if (index !== undefined) {
          handleMeasureDrag(index, event);
        }

        return;
      }
    },
    [dismissNotation, handleMeasureDrag, measureIndexAtPoint],
  );

  // Keeps the sheet scrollable by mouse wheel / trackpad, and auto-scrolls
  // it, for the whole lifetime of a practice-section drag-select - even
  // when the pointer is held over a measure overlay far from any native
  // scroll affordance. Plain (non-drag) scrolling is untouched; these
  // listeners are no-ops whenever dragAnchorRef isn't set.
  useEffect(() => {
    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current !== undefined) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = undefined;
      }
    };
    const runAutoScroll = () => {
      const container = scrollContainerRef.current;

      if (
        !container ||
        autoScrollSpeedRef.current === 0 ||
        dragAnchorRef.current === undefined
      ) {
        autoScrollFrameRef.current = undefined;

        return;
      }

      container.scrollTop += autoScrollSpeedRef.current;
      autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    };
    const endDrag = () => {
      finishMeasureDrag(true);
      stopAutoScroll();
    };
    const cancelDrag = () => {
      finishMeasureDrag(false);
      stopAutoScroll();
    };
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const container = scrollContainerRef.current;

      if (dragAnchorRef.current === undefined || !container) {
        return;
      }

      const rect = container.getBoundingClientRect();

      autoScrollSpeedRef.current = autoScrollSpeed(event.clientY, {
        top: rect.top,
        bottom: rect.bottom,
      });

      if (
        autoScrollSpeedRef.current !== 0 &&
        autoScrollFrameRef.current === undefined
      ) {
        autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
      }
    };
    // Forwards wheel/trackpad scroll to the scroll container directly
    // while a drag-select is in progress, rather than relying on the
    // pointer-down state not interfering with the browser's own wheel
    // handling of the same ancestor.
    const handleWheel = (event: WheelEvent) => {
      const container = scrollContainerRef.current;

      if (dragAnchorRef.current === undefined || !container) {
        return;
      }

      event.preventDefault();
      container.scrollTop += event.deltaY;
      container.scrollLeft += event.deltaX;
    };

    window.addEventListener('mouseup', endDrag);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
      stopAutoScroll();
    };
  }, [finishMeasureDrag]);

  useEffect(() => {
    engine?.setRendererRefs({
      cursorEl: cursorRef.current ?? undefined,
      highlightEls: highlightsRef.map((ref) => ref.current ?? undefined),
      overlayEl: overlayRef.current ?? undefined,
    });
  }, [engine, renderData, highlightsRef]);

  useEffect(() => {
    if (focusIndex === undefined) {
      return;
    }

    const el = highlightsRef[focusIndex]?.current;
    const container = getScrollParent(el ?? undefined);

    if (!el || !container) {
      return;
    }

    const elRect = el.getBoundingClientRect();
    const parentRect = container.getBoundingClientRect();
    const margin = parentRect.height * 0.25;
    const outOfView =
      elRect.top < parentRect.top + margin ||
      elRect.bottom > parentRect.bottom - margin;

    if (outOfView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusIndex, highlightsRef]);

  const measureHighlights = useMemo(() => {
    const isSelected = (index: number) =>
      isLooping &&
      practiceRange !== undefined &&
      index >= practiceRange.start &&
      index <= practiceRange.end;
    const isSameRow = (a: number, b: number) =>
      renderData[a] !== undefined &&
      renderData[b] !== undefined &&
      renderData[a].yOffset === renderData[b].yOffset;

    return renderData.map(({ measure, stave, yOffset }, index) => {
      const selected = isSelected(index);
      const focused =
        index === focusIndex &&
        (isLooping ? practiceRange === undefined : true);
      const mergeLeft =
        selected && isSelected(index - 1) && isSameRow(index, index - 1);
      const mergeRight =
        selected && isSelected(index + 1) && isSameRow(index, index + 1);

      return (
        <div
          key={index}
          ref={highlightsRef[index]}
          data-testid="measure-overlay"
          data-measure-index={index}
          data-focused={focused ? 'true' : undefined}
          data-selected={selected ? 'true' : undefined}
          style={{
            top: yOffset + stave.getY(),
            left: stave.getX() - 5,
            width: stave.getWidth() + 10,
            height: stave.getHeight() + 30,
          }}
          className={cn(
            'drumroll-measure-overlay',
            {
              'drumroll-measure-overlay--selected': selected,
              'drumroll-measure-overlay--merge-left': mergeLeft,
              'drumroll-measure-overlay--merge-right': mergeRight,
              'drumroll-measure-overlay--focused': focused,
            },
            (isDev || gameMode === 'practice') &&
              'drumroll-measure-overlay--selectable',
          )}
          onMouseDown={(event) => handleMeasureMouseDown(index, event)}
          onPointerDown={(event) => {
            handleMeasureMouseDown(index, event);
          }}
          onMouseEnter={(event) => handleMeasureDrag(index, event)}
          onPointerEnter={(event) => handleMeasureDrag(index, event)}
          onClick={(event) => {
            if (
              (gameMode !== 'practice' && isDev) ||
              (gameMode === 'practice' && !isLooping)
            ) {
              onSelectMeasure(measure, event);
            }
          }}
        />
      );
    });
  }, [
    isLooping,
    renderData,
    highlightsRef,
    isDev,
    onSelectMeasure,
    gameMode,
    practiceRange,
    focusIndex,
    handleMeasureMouseDown,
    handleMeasureDrag,
  ]);
  const loopClearAffordance =
    isLooping && practiceRange && onClearLoop
      ? (() => {
          const end = renderData[practiceRange.end];

          if (!end) {
            return null;
          }

          return (
            <button
              type="button"
              className="drumroll-loop-clear"
              data-testid="clear-practice-loop"
              data-loop-clear="true"
              aria-label={`Clear loop bars ${practiceRange.start + 1} to ${
                practiceRange.end + 1
              }`}
              style={{
                top: Math.max(0, end.yOffset + end.stave.getY() - 24),
                left: end.stave.getX() + end.stave.getWidth() - 28,
              }}
              onPointerDownCapture={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onClearLoop();
              }}
            >
              ×
            </button>
          );
        })()
      : null;
  const isFlow = layout === 'flow';
  const scoreCredits = songData.lesson
    ? []
    : [
        songData.artist ? `Music by ${songData.artist}` : undefined,
        songData.charter && songData.charter !== songData.artist
          ? `Arranged by ${songData.charter}`
          : undefined,
      ].filter((credit): credit is string => Boolean(credit));
  const flowPlayhead = !isFlow ? null : (
    <div
      ref={fixedFlowPlayheadRef}
      className="drumroll-flow-fixed-playhead"
      data-testid="flow-fixed-playhead"
      aria-hidden="true"
      style={{ display: 'none' }}
    >
      <span className="drumroll-flow-fixed-playhead__label">
        <span className="drumroll-flow-fixed-playhead__now">Now</span>
        <span
          className="drumroll-flow-fixed-playhead__location"
          data-flow-location
        >
          Bar 1 / {renderData.length} · Beat 1
        </span>
      </span>
      <span className="drumroll-flow-fixed-playhead__beat" />
    </div>
  );
  const [flowAutoZoom, setFlowAutoZoom] = useState(
    FLOW_AUTO_ZOOM_MIN_MULTIPLIER,
  );
  const [classicHeaderWidth, setClassicHeaderWidth] = useState<number>();

  // Flow deliberately renders larger than Classic's fixed browsing scale:
  // notation is the one dominant object on the practice screen (see
  // visual-system-v3's "one dominant object" rule - the score earns at
  // least 58-65% of the usable area, not roughly a third of a mostly-empty
  // canvas), so it claims a deliberate share of its own real viewport
  // height instead of sitting small in a big empty room. Classic keeps the
  // stable, always-1.15x reference scale - it's a full-page browsable
  // sheet, not a live single-row performance stage, so there is no
  // "relearn the size when the mode changes" hazard between the two.
  useLayoutEffect(() => {
    if (!isFlow) {
      return undefined;
    }

    const viewport = wrapperRef.current?.parentElement;
    const notation = vexflowContainerRef.current;

    if (!viewport || !notation) {
      return undefined;
    }

    const recompute = () => {
      // notation.offsetHeight is in local, pre-zoom units (Chromium's
      // non-standard `zoom` does not change a descendant's own offsetWidth/
      // offsetHeight, only its on-screen size - see the visualScale ratio
      // ContinuousNotationCamera already relies on for the same reason) -
      // so measuring it here while some presentationZoom is already
      // applied is not circular with the value this effect produces.
      setFlowAutoZoom(
        flowAutoZoomMultiplier(notation.offsetHeight, viewport.clientHeight),
      );
    };

    recompute();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(recompute);

    observer.observe(viewport);
    observer.observe(notation);

    return () => observer.disconnect();
  }, [isFlow, renderData, vexflowContainerRef]);

  const presentationZoom = isFlow ? flowAutoZoom * zoom : zoom * 1.15;

  useLayoutEffect(() => {
    if (isFlow) {
      return undefined;
    }

    const viewport = wrapperRef.current?.parentElement;
    const score = flowStageRef.current;

    if (!viewport || !score) {
      return undefined;
    }

    const updateHeaderWidth = () => {
      const scoreStyle = window.getComputedStyle(score);
      const scorePadding =
        Number.parseFloat(scoreStyle.paddingLeft) +
        Number.parseFloat(scoreStyle.paddingRight);
      const nextWidth = Math.max(
        0,
        viewport.clientWidth / presentationZoom - scorePadding,
      );

      setClassicHeaderWidth((currentWidth) =>
        currentWidth !== undefined && Math.abs(currentWidth - nextWidth) < 0.5
          ? currentWidth
          : nextWidth,
      );
    };

    updateHeaderWidth();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(updateHeaderWidth);

    observer.observe(viewport);

    return () => observer.disconnect();
  }, [isFlow, presentationZoom]);

  return (
    <div
      ref={wrapperRef}
      className={cn('min-w-max', isFlow && 'drumroll-flow-notation')}
      style={{ zoom: presentationZoom }}
      data-testid={isFlow ? 'flow-notation' : 'classic-notation'}
      data-presentation-zoom={presentationZoom.toFixed(2)}
    >
      {isFlow && timeStore && chart && (
        <ContinuousNotationCamera
          notationRef={scoreRef}
          stageRef={flowStageRef}
          fixedPlayheadRef={fixedFlowPlayheadRef}
          timeStore={timeStore}
          chart={chart}
          renderData={renderData}
          delaySeconds={delaySeconds}
        />
      )}
      {flowPlayhead &&
        (typeof document === 'undefined'
          ? flowPlayhead
          : createPortal(flowPlayhead, document.body))}
      <div
        ref={flowStageRef}
        className={cn(
          'drumroll-score-surface',
          isFlow
            ? cn(
                'drumroll-flow-stage',
                loopEscape && 'drumroll-flow-stage--loop-escape',
              )
            : 'drumroll-classic-score',
        )}
      >
        {!isFlow && (
          <>
            <h1
              className="drumroll-classic-score-header drumroll-classic-score-title my-0 text-xl text-ink font-semibold"
              data-testid="sheet-score-title"
              style={{ width: classicHeaderWidth }}
            >
              {songData.name}
            </h1>
            {scoreCredits.length > 0 && (
              <div
                className="drumroll-classic-score-header drumroll-classic-score-credits text-[15px] italic font-bold flex flex-col items-end text-ink"
                data-testid="sheet-score-credits"
                style={{ width: classicHeaderWidth }}
              >
                {scoreCredits.map((credit) => (
                  <div key={credit}>{credit}</div>
                ))}
              </div>
            )}
          </>
        )}
        <div
          ref={scoreRef}
          className="min-w-max relative z-0"
          onPointerDownCapture={handleScorePointerDown}
          onPointerMoveCapture={handleScorePointerMove}
        >
          {gameMode === 'practice' && <PatternBands renderData={renderData} />}
          {isFlow && <FlowMeter renderData={renderData} />}
          {isFlow && loopEscape && (
            <LoopEscapeRunway renderData={renderData} model={loopEscape} />
          )}
          <div
            ref={vexflowContainerRef}
            className={cn(
              'min-w-max relative z-1 drumroll-sheet-music__notation',
              isFlow && 'drumroll-flow-score',
            )}
          />
          {measureHighlights}
          {loopClearAffordance}
          <div
            ref={cursorRef}
            data-testid="playhead-cursor"
            className="absolute top-0 left-0 z-1 pointer-events-none shadow-accent-button will-change-transform"
            style={{ display: 'none' }}
          >
            <div
              className="absolute w-3 h-3 bg-accent-bright left-1/2 rounded-[3px]"
              style={{ transform: 'translateX(-50%) rotate(45deg)' }}
            />
            <div className="absolute w-0.75 bg-accent-bright h-full rounded-[3px] left-1/2 -translate-x-1/2" />
          </div>
          <NotationGlossary intent={notationGlossaryIntent} />
          <div
            ref={overlayRef}
            data-testid="sheet-music-overlay"
            className="absolute top-0 left-0 z-2 pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
