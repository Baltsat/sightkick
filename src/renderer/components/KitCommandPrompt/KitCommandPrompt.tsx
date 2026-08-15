import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { CSSProperties, Fragment } from 'react';
import { KitElement } from '../../services/practice-stats';
import bronzeCymbal from '../../assets/daybreak/journey-nodes/bronze-cymbal.png';
import kickPad from '../../assets/daybreak/journey-nodes/kick-pad.png';
import meshPad from '../../assets/daybreak/journey-nodes/mesh-pad.png';
import pearlSnare from '../../assets/daybreak/journey-nodes/pearl-snare.png';
import './KitCommandPrompt.css';

export type KitCommandElement = KitElement | 'any';

export interface KitCommandPromptModel {
  label: string;
  steps: readonly KitCommandElement[];
  /** Ordered command by default; alternatives are separate one-hit choices. */
  relationship?: 'sequence' | 'alternatives';
  /** Plain-language result for each alternative, in the same order. */
  stepHints?: readonly string[];
}

/**
 * How each pad is drawn wherever the kit is used as a control surface — the
 * standard drum colours the player already reads in the score and on the
 * home kit. Exported so the result screen prints the same pad, in the same
 * colour, as the prompt does.
 */
export const KIT_COMMAND_PRESENTATION: Record<
  KitCommandElement,
  { label: string; image: string; color: string }
> = {
  any: { label: 'Any pad', image: meshPad, color: 'var(--color-cyan)' },
  kick: { label: 'Kick', image: kickPad, color: 'var(--color-orange)' },
  snare: { label: 'Snare', image: pearlSnare, color: 'var(--color-red)' },
  hihat: { label: 'Hi-hat', image: bronzeCymbal, color: 'var(--color-yellow)' },
  crash: { label: 'Crash', image: bronzeCymbal, color: 'var(--color-green)' },
  ride: { label: 'Ride', image: bronzeCymbal, color: 'var(--color-blue)' },
  tom1: { label: 'Tom 1', image: meshPad, color: 'var(--color-yellow)' },
  tom2: { label: 'Tom 2', image: meshPad, color: 'var(--color-blue)' },
  tom3: { label: 'Tom 3', image: meshPad, color: 'var(--color-green)' },
};

export function KitCommandPrompt({
  model,
  compact = false,
  tone = 'light',
}: {
  model: KitCommandPromptModel;
  compact?: boolean;
  tone?: 'light' | 'dark';
}) {
  const relationship = model.relationship ?? 'sequence';
  const spokenSequence = model.steps
    .map((element, index) => {
      const label = KIT_COMMAND_PRESENTATION[element].label;
      const hint = model.stepHints?.[index];

      return hint ? `${label} for ${hint.toLowerCase()}` : label;
    })
    .join(relationship === 'alternatives' ? ', or ' : ', then ');

  return (
    <div
      className="drumroll-kit-command"
      data-testid="kit-command-prompt"
      data-compact={compact || undefined}
      data-tone={tone}
      aria-label={`${model.label}: ${spokenSequence}`}
    >
      <span className="drumroll-kit-command__label">{model.label}</span>
      <span className="drumroll-kit-command__steps" aria-hidden="true">
        {model.steps.map((element, index) => {
          const step = KIT_COMMAND_PRESENTATION[element];

          return (
            <Fragment key={`${element}-${index}`}>
              {index > 0 &&
                (relationship === 'alternatives' ? (
                  <span className="drumroll-kit-command__or">or</span>
                ) : (
                  <FontAwesomeIcon
                    className="drumroll-kit-command__arrow"
                    icon={faChevronRight}
                  />
                ))}
              <span
                className="drumroll-kit-command__step"
                style={{ '--kit-command-color': step.color } as CSSProperties}
              >
                <img src={step.image} alt="" />
                <span className="drumroll-kit-command__step-copy">
                  <strong>{step.label}</strong>
                  {model.stepHints?.[index] && (
                    <small>{model.stepHints[index]}</small>
                  )}
                </span>
              </span>
            </Fragment>
          );
        })}
      </span>
    </div>
  );
}
