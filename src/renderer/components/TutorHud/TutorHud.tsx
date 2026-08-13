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
import type { KitElement } from '../../services/practice-stats';
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
    <span
      className="drumroll-tutor-hud__mistake-chip"
      data-kit-element={element}
    >
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
            roleLabel="Chart calls for"
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
    return 'One focused repair';
  }

  if (phase === 'complete') {
    return 'Phrase complete';
  }

  return 'Practice guide';
}

function kitLabel(value: string | undefined): string | undefined {
  return value !== undefined && value in KIT_ELEMENT_LABEL
    ? KIT_ELEMENT_LABEL[value as KitElement]
    : undefined;
}

function tutorNextReason(
  state: TutorState,
  displayState: TutorHudProps['displayState'],
  recoveryCaption: TutorHudProps['recoveryCaption'],
): string | undefined {
  const recovery = state.recovery;

  if (recovery) {
    const pair = recovery.trigger.wrongPadPair;
    const expected = kitLabel(pair?.expectedElement)?.toLowerCase();
    const actual = kitLabel(pair?.actualElement)?.toLowerCase();
    const skill =
      recovery.trigger.reason === 'repeated-wrong-pad-pair'
        ? expected
          ? `${expected} placement`
          : 'the intended drum placement'
        : recovery.trigger.reason === 'timing-spread'
        ? 'a steadier pulse'
        : 'the phrase handoff';
    const observation =
      recovery.trigger.reason === 'repeated-wrong-pad-pair' &&
      actual &&
      expected
        ? `the ${actual} → ${expected} switch repeated`
        : recovery.trigger.reason === 'timing-spread'
        ? 'the pulse spread across this phrase'
        : 'this phrase needs a smaller, musical return';
    const nextAction =
      recovery.approach === 'return-context'
        ? 'carry it through one more bar so it survives the return to the song.'
        : 'settle the anchor phrase, then carry it into the next bar.';

    return `Build ${skill}: ${observation}; ${nextAction}`;
  }

  if (displayState === 'remediation') {
    if (recoveryCaption?.title === 'First anchor acquired') {
      return 'The anchor is in. Take the same phrase one small tempo step so it holds after the loop.';
    }

    if (recoveryCaption?.title === 'Near-clean quality retained') {
      return 'The phrase is close. Keep the same target and settle one full pass.';
    }

    if (recoveryCaption?.title === 'Loop released') {
      return 'Take this phrase back into the song now; the next context is the useful proof.';
    }

    return 'Settle this observed phrase first. One clean anchor earns a nearby-tempo return.';
  }

  return undefined;
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
    const evidence = judgement ? describeMistake(judgement) : undefined;

    return evidence && judgement
      ? {
          key: JSON.stringify(state.judgementsByMeasure),
          evidence,
        }
      : undefined;
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
  const nextReason = tutorNextReason(state, displayState, recoveryCaption);
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
      {nextReason && (
        <span
          className="drumroll-tutor-hud__reason"
          data-testid="tutor-next-reason"
        >
          {nextReason}
        </span>
      )}
      {speedChange && (
        <>
          <span
            className="drumroll-practice-edge-caption__detail"
            data-testid="coach-speed-change"
          >
            Try this loop at {speedChange.applied.toFixed(1)}×; keep your own
            speed if it feels right.
          </span>
          <Button
            data-testid="keep-learner-speed"
            onClick={speedChange.onKeepOwnSpeed}
          >
            Keep my {speedChange.previous.toFixed(1)}×
          </Button>
        </>
      )}
      {mistake && (
        <TutorMistakeDisclosure key={mistake.key} mistake={mistake.evidence} />
      )}
    </aside>
  );
}
