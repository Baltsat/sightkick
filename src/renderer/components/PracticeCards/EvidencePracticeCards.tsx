import { useState } from 'react';
import { cn } from '../../cn';
import type {
  PracticeCardKind,
  PracticeCardOption,
  PracticeCardSet,
} from '../../services/pedagogy';
import './EvidencePracticeCards.css';

export interface EvidencePracticeCardsProps {
  cards: PracticeCardSet['cards'];
  onStart?: (option: PracticeCardOption) => void;
  compact?: boolean;
  testId?: string;
}

function optionIndex(
  selected: Partial<Record<PracticeCardKind, number>>,
  kind: PracticeCardKind,
  length: number,
): number {
  return Math.max(0, selected[kind] ?? 0) % length;
}

export function EvidencePracticeCards({
  cards,
  onStart,
  compact = false,
  testId = 'practice-card',
}: EvidencePracticeCardsProps) {
  const [selected, setSelected] = useState<
    Partial<Record<PracticeCardKind, number>>
  >({});
  const [deferred, setDeferred] = useState<
    Partial<Record<PracticeCardKind, boolean>>
  >({});

  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        'grid gap-3',
        compact
          ? 'practice-card-controls practice-card-controls--compact'
          : 'practice-card-controls',
      )}
      data-testid={`${testId}-set`}
      aria-label="Suggested practice"
    >
      {cards.map((card) => {
        const index = optionIndex(selected, card.kind, card.options.length);
        const option = card.options[index];
        const isDeferred = deferred[card.kind] === true;

        return (
          <article
            key={card.kind}
            className="practice-card-control"
            data-kind={card.kind}
            data-testid={`${testId}-${card.kind}`}
          >
            <p className="practice-card-control__label">{card.label}</p>
            <strong className="practice-card-control__title">
              {option.title}
            </strong>
            <span className="practice-card-control__source">
              Based on: {option.source_label}
            </span>
            {isDeferred ? (
              <div className="practice-card-control__actions">
                <span className="practice-card-control__later">
                  Left for later
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDeferred((current) => ({
                      ...current,
                      [card.kind]: false,
                    }))
                  }
                >
                  Restore
                </button>
              </div>
            ) : (
              <>
                <span className="practice-card-control__completion">
                  Done: {option.completion_label}
                </span>
                <div className="practice-card-control__actions">
                  <button
                    type="button"
                    data-testid={`${testId}-${card.kind}-start`}
                    onClick={() => onStart?.(option)}
                    disabled={!onStart}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    data-testid={`${testId}-${card.kind}-swap`}
                    onClick={() =>
                      setSelected((current) => ({
                        ...current,
                        [card.kind]: index + 1,
                      }))
                    }
                    disabled={card.options.length < 2}
                    title={
                      card.options.length < 2
                        ? 'No other saved option is available.'
                        : undefined
                    }
                  >
                    Swap
                  </button>
                  <button
                    type="button"
                    data-testid={`${testId}-${card.kind}-later`}
                    onClick={() =>
                      setDeferred((current) => ({
                        ...current,
                        [card.kind]: true,
                      }))
                    }
                  >
                    Leave for later
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
