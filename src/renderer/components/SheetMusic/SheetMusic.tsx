import {
  MouseEvent,
  RefObject,
  createRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { cn } from '../../cn';
import { Measure, RenderData } from '../../../chart-parser/types';
import { ParsedChart } from '../../../chart-parser/types';
import { SheetMusicLayout } from '../../../chart-parser/renderer';
import { Engine } from '../../services/engine';
import { TimeStore } from '../../services/time-store';
import { Song } from '../../../types';
import { Reference } from './Reference';
import { GameMode, PracticeRange } from '../../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRepeat, faXmark } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from '../IconButton';
import { getScrollParent } from '../../services/engine/helpers';
import { autoScrollSpeed } from './helpers';
import {
  ContinuousNotationCamera,
  FlowMeter,
  LoopEscapeRunway,
  LoopEscapeRunwayModel,
} from '../ContinuousNotation';

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
  onSelectMeasure: (measure: Measure, event: MouseEvent) => void;
  enableColors: boolean;
  showReference: boolean;
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
  onSelectMeasure,
  showReference,
  enableColors,
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
  // The scroll container a selection drag is happening over, cached for
  // the lifetime of the drag (resolved once on mousedown rather than on
  // every mousemove/wheel event) - see the wheel/auto-scroll effect below.
  const scrollContainerRef = useRef<HTMLElement | undefined>(undefined);
  const autoScrollSpeedRef = useRef(0);
  const autoScrollFrameRef = useRef<number | undefined>(undefined);
  const handleMeasureMouseDown = useCallback(
    (index: number) => {
      if (!isSelectable || !isLooping) {
        return;
      }

      dragAnchorRef.current = index;
      scrollContainerRef.current = getScrollParent(
        wrapperRef.current ?? undefined,
      );
      onPracticeRangeChange?.({ start: index, end: index });
    },
    [isSelectable, onPracticeRangeChange, isLooping],
  );
  const handleMeasureMouseEnter = useCallback(
    (index: number) => {
      const anchor = dragAnchorRef.current;

      if (anchor === undefined) {
        return;
      }

      onPracticeRangeChange?.({
        start: Math.min(anchor, index),
        end: Math.max(anchor, index),
      });
    },
    [onPracticeRangeChange],
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
      dragAnchorRef.current = undefined;
      scrollContainerRef.current = undefined;
      autoScrollSpeedRef.current = 0;
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
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
      stopAutoScroll();
    };
  }, []);

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
            'absolute z-[-3] rounded-[11px] border-0 bg-transparent',
            {
              'bg-accent-soft-bg-solid border-2! border-accent-bright!':
                selected,
              'border-l-0! rounded-l-none': mergeLeft,
              'border-r-0! rounded-r-none': mergeRight,
              'bg-accent-medium-bg shadow-accent-soft border border-accent-soft-border z-[-1]!':
                focused,
            },
            (isDev || gameMode === 'practice') &&
              'cursor-pointer hover:bg-accent-medium-bg hover:shadow-accent-soft hover:border hover:border-accent-soft-border hover:z-[-1]',
          )}
          onMouseDown={() => handleMeasureMouseDown(index)}
          onMouseEnter={() => handleMeasureMouseEnter(index)}
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
    handleMeasureMouseEnter,
  ]);
  const isFlow = layout === 'flow';
  // Both layouts use the exact same canonical VexFlow glyph scale. Flow
  // changes only the camera and viewport; switching modes must never make
  // the score subtly smaller or force the drummer to relearn its proportions.
  // `zoom` remains the player's multiplier; the shared 1.15 baseline makes
  // 1.0 readable from the drum throne without taking that control away.
  const presentationZoom = zoom * 1.15;

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
      {isFlow && (
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
      )}
      {gameMode === 'practice' &&
        isLooping &&
        practiceRange &&
        !(isFlow && loopEscape) && (
          <div className="fixed top-35 ml-10 bg-bg rounded-md z-100 px-4 py-3 flex items-center gap-2">
            <div className="text-accent bg-accent-soft-bg p-2 border border-accent-soft-border rounded-md w-10 h-10 flex items-center justify-center">
              <FontAwesomeIcon icon={faRepeat} />
            </div>
            <div>
              <div className="text-[16px] font-semibold">Looping Section</div>
              <div className="text-xs text-text-muted">
                Measure{' '}
                {practiceRange.start === practiceRange.end
                  ? practiceRange.start + 1
                  : `${practiceRange.start + 1} - ${practiceRange.end + 1}`}
              </div>
            </div>
            <IconButton
              icon={faXmark}
              data-testid="clear-loop"
              onClick={() => onPracticeRangeChange?.(undefined)}
            />
          </div>
        )}
      <div
        ref={flowStageRef}
        className={cn(
          'flex flex-col items-center min-w-max',
          isFlow
            ? cn(
                'drumroll-flow-stage',
                loopEscape && 'drumroll-flow-stage--loop-escape',
              )
            : 'bg-paper rounded-[11px] p-10',
        )}
      >
        {!isFlow && (
          <>
            <h1 className="my-0 mx-auto text-4xl text-ink font-semibold">
              {songData.name}
            </h1>
            <div className="ml-auto text-[15px] italic font-bold flex flex-col items-end text-ink">
              <div>Music by {songData.artist}</div>
              <div>Arranged by {songData.charter}</div>
            </div>
          </>
        )}
        <div ref={scoreRef} className="min-w-max relative z-0">
          {isFlow && <FlowMeter renderData={renderData} />}
          {isFlow && loopEscape && (
            <LoopEscapeRunway renderData={renderData} model={loopEscape} />
          )}
          <div
            ref={vexflowContainerRef}
            className={cn(
              'min-w-max pointer-events-none **:pointer-events-none',
              isFlow && 'drumroll-flow-score',
            )}
          />
          {measureHighlights}
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
          <div
            ref={overlayRef}
            data-testid="sheet-music-overlay"
            className="absolute top-0 left-0 z-2 pointer-events-none"
          />
        </div>
      </div>

      {enableColors && showReference && (
        <Reference
          className={cn(
            'fixed left-1/2 -translate-x-1/2',
            gameMode === 'practice'
              ? 'drumroll-reference--above-tutor'
              : 'bottom-10',
          )}
        />
      )}
    </div>
  );
}
