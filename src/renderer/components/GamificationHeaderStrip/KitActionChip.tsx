import { CSSProperties } from 'react';
import { KIT_COMMAND_PRESENTATION } from '../KitCommandPrompt';
import {
  DrumGestureAction,
  RESULT_KIT_COMMANDS,
} from '../../services/gestures';
import './KitActionChip.css';

export function KitActionChip({
  action,
  compact = false,
}: {
  action: DrumGestureAction;
  compact?: boolean;
}) {
  const command = RESULT_KIT_COMMANDS.find(
    (candidate) => candidate.action === action,
  );

  if (!command) {
    return null;
  }

  const pad = KIT_COMMAND_PRESENTATION[command.element];

  return (
    <span
      className="kit-action-chip"
      data-testid={`kit-action-chip-${action}`}
      data-pad={command.element}
      data-compact={compact || undefined}
      style={{ '--kit-action-color': pad.color } as CSSProperties}
    >
      <img src={pad.image} alt="" />
      <span>{pad.label}</span>
    </span>
  );
}
