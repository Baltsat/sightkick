import { enforce_ai_tutor_safety } from './safety';
import {
  AiTutorAdvisoryAnnotation,
  AiTutorAdvisoryResult,
  AiTutorPracticeState,
  AiTutorTransport,
} from './types';

export interface AiTutorFeatureFlags {
  enabled: boolean;
}

export const DEFAULT_AI_TUTOR_FEATURE_FLAGS: Readonly<AiTutorFeatureFlags> =
  Object.freeze({ enabled: false });

export const DEFAULT_AI_TUTOR_ADVISORY_TIMEOUT_MS = 8_000;

export interface AiTutorAdvisoryOptions {
  flags?: Partial<AiTutorFeatureFlags>;
  transport?: AiTutorTransport;
  timeout_ms?: number;
  now?: () => string;
  consume_advisory?: (annotation: AiTutorAdvisoryAnnotation) => void;
}

function error_detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function request_ai_tutor_advisory(
  state: AiTutorPracticeState,
  options: AiTutorAdvisoryOptions = {},
): Promise<AiTutorAdvisoryResult> {
  const flags = { ...DEFAULT_AI_TUTOR_FEATURE_FLAGS, ...options.flags };

  if (!flags.enabled) {
    return { status: 'disabled' };
  }

  if (!options.transport) {
    return {
      status: 'fallback',
      reason: 'unavailable',
      detail: 'No AI tutor transport is configured.',
    };
  }

  const controller = new AbortController();
  const timeout_ms = options.timeout_ms ?? DEFAULT_AI_TUTOR_ADVISORY_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  timer.unref?.();

  try {
    const receipt = await options.transport.request_decision(
      state,
      controller.signal,
    );

    if (receipt.request_id !== state.request_id) {
      return {
        status: 'fallback',
        reason: 'stale_response',
        detail: 'The AI tutor response belongs to another practice snapshot.',
      };
    }

    const safe = enforce_ai_tutor_safety(state, receipt.decision);
    const annotation: AiTutorAdvisoryAnnotation = {
      advisory_only: true,
      request_id: receipt.request_id,
      deterministic_decision_id:
        state.current_chunk_plan.deterministic_decision_id,
      received_at: (options.now ?? (() => new Date().toISOString()))(),
      latency_ms: receipt.latency_ms,
      transport: receipt.transport,
      ...safe,
    };

    options.consume_advisory?.(annotation);

    return { status: 'advisory', annotation };
  } catch (error) {
    return {
      status: 'fallback',
      reason: controller.signal.aborted ? 'timeout' : 'transport_error',
      detail: error_detail(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
