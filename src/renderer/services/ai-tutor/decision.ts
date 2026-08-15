import { AiTutorDecision, AiTutorNextAction } from './types';

export const AI_TUTOR_NEXT_ACTIONS: readonly AiTutorNextAction[] = [
  'repeat_window',
  'change_window',
  'change_tempo',
  'advance_chunk',
  'return_to_song',
  'end_session',
];

export const AI_TUTOR_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    next_action: { type: 'string', enum: AI_TUTOR_NEXT_ACTIONS },
    window: {
      type: 'object',
      properties: {
        start_measure: { type: 'integer', minimum: 0 },
        end_measure: { type: 'integer', minimum: 0 },
        start_tick: { type: 'integer', minimum: 0 },
        end_tick: { type: 'integer', minimum: 1 },
      },
      required: ['start_measure', 'end_measure', 'start_tick', 'end_tick'],
      additionalProperties: false,
    },
    tempo: {
      type: 'object',
      properties: {
        playback_speed: { type: 'number', minimum: 0.25, maximum: 1.5 },
        target_bpm: {
          anyOf: [
            { type: 'number', minimum: 20, maximum: 400 },
            { type: 'null' },
          ],
        },
      },
      required: ['playback_speed', 'target_bpm'],
      additionalProperties: false,
    },
    encouragement_line: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      description:
        'SimpleEnglish procedure. Start with one action. Use 20 words or fewer. No semicolons, hedging, or filler.',
    },
    rationale: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description:
        'SimpleEnglish description. Use active voice, simple tenses, one topic, and 25 words or fewer per sentence.',
    },
  },
  required: [
    'next_action',
    'window',
    'tempo',
    'encouragement_line',
    'rationale',
  ],
  additionalProperties: false,
} as const;

export class AiTutorDecisionValidationError extends Error {}

const BANNED_AI_TUTOR_COPY =
  /\b(?:can|could|may|might|should|simply|seamlessly|robust|powerful|comprehensive|leverage|effortlessly|unlock(?:s|ed|ing)?)\b/i;
const BANNED_AI_TUTOR_METAPHOR = /\bjourney\b/;

function sentence_word_counts(value: string): number[] {
  return value
    .split(/[.!?]+|\n+/)
    .map((sentence) => sentence.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g))
    .filter((words): words is RegExpMatchArray => words !== null)
    .map((words) => words.length);
}

function record_value(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AiTutorDecisionValidationError(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function number_value(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new AiTutorDecisionValidationError(
      `${label} must be between ${minimum} and ${maximum}`,
    );
  }

  return value;
}

function integer_value(value: unknown, label: string): number {
  const result = number_value(value, label, 0, Number.MAX_SAFE_INTEGER);

  if (!Number.isInteger(result)) {
    throw new AiTutorDecisionValidationError(`${label} must be an integer`);
  }

  return result;
}

function string_value(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') {
    throw new AiTutorDecisionValidationError(`${label} must be a string`);
  }

  const result = value.trim();

  if (!result || result.length > maximum) {
    throw new AiTutorDecisionValidationError(
      `${label} must contain 1 to ${maximum} characters`,
    );
  }

  return result;
}

function styled_string_value(
  value: unknown,
  label: string,
  maximum: number,
  sentence_word_limit: number,
  one_sentence: boolean,
): string {
  const result = string_value(value, label, maximum);
  const word_counts = sentence_word_counts(result);

  if (
    result.includes(';') ||
    BANNED_AI_TUTOR_COPY.test(result) ||
    BANNED_AI_TUTOR_METAPHOR.test(result) ||
    /\b(?:has|have)\s+(?:been|[a-z]+ed)\b/i.test(result) ||
    word_counts.some((count) => count > sentence_word_limit) ||
    (one_sentence && word_counts.length !== 1)
  ) {
    throw new AiTutorDecisionValidationError(
      `${label} breaks the SimpleEnglish copy rule`,
    );
  }

  return result;
}

export function parse_ai_tutor_decision(value: unknown): AiTutorDecision {
  const decision = record_value(value, 'decision');
  const window = record_value(decision.window, 'window');
  const tempo = record_value(decision.tempo, 'tempo');
  const next_action = decision.next_action;

  if (
    typeof next_action !== 'string' ||
    !AI_TUTOR_NEXT_ACTIONS.includes(next_action as AiTutorNextAction)
  ) {
    throw new AiTutorDecisionValidationError('next_action is not supported');
  }

  const start_measure = integer_value(
    window.start_measure,
    'window.start_measure',
  );
  const end_measure = integer_value(window.end_measure, 'window.end_measure');
  const start_tick = integer_value(window.start_tick, 'window.start_tick');
  const end_tick = integer_value(window.end_tick, 'window.end_tick');

  if (start_measure > end_measure) {
    throw new AiTutorDecisionValidationError(
      'window.start_measure must not exceed window.end_measure',
    );
  }

  if (start_tick >= end_tick) {
    throw new AiTutorDecisionValidationError(
      'window.start_tick must be less than window.end_tick',
    );
  }

  const target_bpm =
    tempo.target_bpm === null
      ? null
      : number_value(tempo.target_bpm, 'tempo.target_bpm', 20, 400);

  return {
    next_action: next_action as AiTutorNextAction,
    window: { start_measure, end_measure, start_tick, end_tick },
    tempo: {
      playback_speed: number_value(
        tempo.playback_speed,
        'tempo.playback_speed',
        0.25,
        1.5,
      ),
      target_bpm,
    },
    encouragement_line: styled_string_value(
      decision.encouragement_line,
      'encouragement_line',
      160,
      20,
      true,
    ),
    rationale: styled_string_value(
      decision.rationale,
      'rationale',
      500,
      25,
      false,
    ),
  };
}
