import { useId } from 'react';
import { TutorHudMessage } from '../../hooks/useTutorSession';
import { TutorState } from '../../services/tutor';
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
}: TutorHudProps) {
  const titleId = useId();
  const detailId = useId();

  if (
    state.phase === 'off' &&
    !displayState &&
    !controlPrompt &&
    !recoveryCaption
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
    </aside>
  );
}
