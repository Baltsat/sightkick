import { CSSProperties, useId, useMemo } from 'react';
import { Button } from 'antd';
import { TutorHudMessage } from '../../hooks/useTutorSession';
import { TutorState } from '../../services/tutor';
import {
  KIT_ELEMENT_COLOR_VAR,
  KIT_ELEMENT_LABEL,
  MistakeEvidence,
  describeMistake,
  lastScoreableMistake,
} from '../../services/pedagogy';
import { KitElement } from '../../services/practice-stats';
import { KitCommandPromptModel } from '../KitCommandPrompt';
import '../PracticeEdgeCaption/PracticeEdgeCaption.css';
import './TutorHud.css';

interface TutorHudProps {
  state: TutorState;
  message: TutorHudMessage;
  displayState?:
    | 'inactivity-paused'
    | 'kit-paused'
    | 'kit-ready'
    | 'recovery-explain'
    | 'remediation';
  controlPrompt?: KitCommandPromptModel;
  recoveryCaption?: {
    title: string;
    detail: string;
  };
  speedChange?: {
    previous: number;
    applied: number;
    onKeepOwnSpeed: () => void;
  };
}

function ElementChip({
  element,
  roleLabel,
}: {
  element: KitElement;
  roleLabel: string;
}) {
  return (
    <span className="drumroll-tutor-hud__mistake-chip">
      <span
        className="drumroll-tutor-hud__mistake-swatch"
        style={
          {
            '--mistake-swatch-color': KIT_ELEMENT_COLOR_VAR[element],
          } as CSSProperties
        }
        aria-hidden="true"
      />
      <span className="drumroll-tutor-hud__mistake-chip-role">{roleLabel}</span>
      <strong>{KIT_ELEMENT_LABEL[element]}</strong>
    </span>
  );
}

/**
 * The player's own resume/correction instruction is the primary message and
 * must never be displaced. This disclosure is deliberately quiet and
 * collapsed by default — see the design acceptance rule "detail is
 * reachable, never preloaded". It only renders once real, judged evidence
 * exists (`describeMistake` returning undefined means Judge itself couldn't
 * say anything truthful about the strike).
 */
function TutorMistakeDisclosure({ mistake }: { mistake: MistakeEvidence }) {
  return (
    <details
      className="drumroll-tutor-hud__mistake"
      data-testid="tutor-mistake"
    >
      <summary data-testid="tutor-mistake-summary">
        <span className="drumroll-tutor-hud__mistake-summary-label">Why</span>
        <span className="drumroll-tutor-hud__mistake-summary-title">
          {mistake.title}
        </span>
      </summary>
      <div className="drumroll-tutor-hud__mistake-body">
        {mistake.expectedElement && (
          <ElementChip
            element={mistake.expectedElement}
            roleLabel="Score called for"
          />
        )}
        {mistake.actualElement && (
          <ElementChip element={mistake.actualElement} roleLabel="You hit" />
        )}
        <p>{mistake.detail}</p>
        <p className="drumroll-tutor-hud__mistake-check">{mistake.check}</p>
      </div>
    </details>
  );
}

function labelForPhase(phase: TutorState['phase']) {
  if (phase === 'recovering') {
    return 'Focused recovery';
  }

  if (phase === 'complete') {
    return 'Session complete';
  }

  return 'Adaptive tutor';
}

export function TutorHud({
  state,
  message,
  displayState,
  controlPrompt,
  recoveryCaption,
  speedChange,
}: TutorHudProps) {
  const titleId = useId();
  const detailId = useId();
  const mistake = useMemo(() => {
    const judgement = lastScoreableMistake(state.judgementsByMeasure);

    return judgement ? describeMistake(judgement) : undefined;
  }, [state.judgementsByMeasure]);

  if (
    state.phase === 'off' &&
    !displayState &&
    !controlPrompt &&
    !recoveryCaption &&
    !speedChange
  ) {
    return null;
  }

  const caption = recoveryCaption ?? {
    title:
      displayState === 'inactivity-paused'
        ? 'Paused — input check'
        : message.title,
    detail:
      displayState === 'kit-paused'
        ? controlPrompt?.label ?? 'Use Play to count in again.'
        : message.detail,
  };
  const kicker =
    displayState === 'remediation'
      ? 'Coach loop'
      : displayState === 'recovery-explain' || recoveryCaption
      ? 'Recovery'
      : displayState === 'kit-paused' || displayState === 'inactivity-paused'
      ? 'Paused'
      : labelForPhase(state.phase);
  const tone =
    message.tone === 'success'
      ? 'earned'
      : message.tone === 'warning'
      ? 'warning'
      : message.tone === 'recovery'
      ? 'recovery'
      : 'neutral';

  return (
    <aside
      className="drumroll-practice-edge-caption drumroll-tutor-hud"
      data-tone={tone}
      data-phase={state.phase}
      data-display-state={displayState}
      data-testid={recoveryCaption ? 'tutor-recovery-caption' : 'tutor-hud'}
      data-edge-caption="tutor"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      <span className="drumroll-practice-edge-caption__kicker drumroll-tutor-hud__kicker">
        {kicker}
      </span>
      <strong id={titleId} className="drumroll-practice-edge-caption__title">
        {caption.title}
      </strong>
      <span id={detailId} className="drumroll-practice-edge-caption__detail">
        {caption.detail}
      </span>
      {speedChange && (
        <>
          <span
            className="drumroll-practice-edge-caption__detail"
            data-testid="coach-speed-change"
          >
            Coach set {speedChange.applied.toFixed(1)}× to rehearse this loop.
          </span>
          <Button
            data-testid="keep-learner-speed"
            onClick={speedChange.onKeepOwnSpeed}
          >
            Keep my {speedChange.previous.toFixed(1)}×
          </Button>
        </>
      )}
      {mistake && <TutorMistakeDisclosure mistake={mistake} />}
    </aside>
  );
}
