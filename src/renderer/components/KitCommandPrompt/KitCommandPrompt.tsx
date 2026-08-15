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

function describeKitCommand(model: KitCommandPromptModel) {
  const relationship = model.relationship ?? 'sequence';

  return model.steps
    .map((element, index) => {
      const label = KIT_COMMAND_PRESENTATION[element].label;
      const hint = model.stepHints?.[index];

      return hint ? `${label} for ${hint.toLowerCase()}` : label;
    })
    .join(relationship === 'alternatives' ? ', or ' : ', then ');
}

function KitCommandSteps({
  model,
  veil = false,
}: {
  model: KitCommandPromptModel;
  veil?: boolean;
}) {
  const relationship = model.relationship ?? 'sequence';

  return (
    <span
      className={`drumroll-kit-command__steps${
        veil ? ' drumroll-kit-command-veil__steps' : ''
      }`}
      aria-hidden="true"
    >
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
              data-element={element}
              style={
                {
                  '--kit-command-color': step.color,
                  '--kit-command-step-index': index,
                } as CSSProperties
              }
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
  );
}

export function KitCommandPrompt({
  model,
  compact = false,
  tone = 'light',
}: {
  model: KitCommandPromptModel;
  compact?: boolean;
  tone?: 'light' | 'dark';
}) {
  const spokenSequence = describeKitCommand(model);

  return (
    <div
      className="drumroll-kit-command"
      data-testid="kit-command-prompt"
      data-compact={compact || undefined}
      data-tone={tone}
      aria-label={`${model.label}: ${spokenSequence}`}
    >
      <span className="drumroll-kit-command__label">{model.label}</span>
      <KitCommandSteps model={model} />
    </div>
  );
}

export function KitCommandVeil({
  kicker,
  title,
  titleAriaLabel,
  model,
  detail,
  tone = 'neutral',
  testId = 'kit-command-veil',
  animated = true,
  state,
}: {
  kicker: string;
  title: string;
  titleAriaLabel?: string;
  model?: KitCommandPromptModel;
  detail?: string;
  tone?: 'neutral' | 'ready' | 'warning';
  testId?: string;
  animated?: boolean;
  state?: string;
}) {
  const primaryElement = model?.steps[0];
  const primaryColor = primaryElement
    ? KIT_COMMAND_PRESENTATION[primaryElement].color
    : 'var(--dr-count)';
  const instruction = model ? `${title}: ${describeKitCommand(model)}` : title;
  const accessibleLabel = [kicker, instruction, detail]
    .filter(Boolean)
    .join('. ');

  return (
    <aside
      className="drumroll-kit-command-veil"
      data-animated={animated}
      data-fullscreen-moment="kit-command"
      data-phase={state}
      data-primary-element={primaryElement}
      data-state={state}
      data-testid={testId}
      data-tone={tone}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={accessibleLabel}
      style={{ '--kit-command-primary-color': primaryColor } as CSSProperties}
    >
      <div className="drumroll-kit-command-veil__content">
        <span className="drumroll-kit-command-veil__kicker">{kicker}</span>
        <strong
          className="drumroll-kit-command-veil__title"
          aria-label={titleAriaLabel}
        >
          {title}
        </strong>
        {model && <KitCommandSteps model={model} veil />}
        {detail && (
          <p className="drumroll-kit-command-veil__detail">{detail}</p>
        )}
      </div>
    </aside>
  );
}
