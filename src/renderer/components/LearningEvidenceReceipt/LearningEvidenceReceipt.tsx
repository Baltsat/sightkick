import type { RunSummary } from '../../services/practice-stats';
import { learningEvidenceReceipt } from '../../services/pedagogy';

function plural(count: number, singular: string): string {
  return String(count) + ' ' + singular + (count === 1 ? '' : 's');
}

function timingDetail(
  windowMs: number,
  normalizedAtomicReceipts: number,
  recorded: number,
): string {
  return (
    ' Judged within ±' +
    Math.round(windowMs) +
    ' ms; ' +
    normalizedAtomicReceipts +
    '/' +
    recorded +
    ' receipt' +
    (recorded === 1 ? '' : 's') +
    ' record the window used to normalize timing.'
  );
}

export function LearningEvidenceReceipt({
  summary,
  heading = 'Evidence receipt',
}: {
  summary?: RunSummary;
  heading?: string;
}) {
  if (!summary) {
    return null;
  }

  const receipt = learningEvidenceReceipt(summary);
  const hasAtomicEvidence = receipt.atomic.recorded > 0;
  const hasCoachEvidence = receipt.coach.findings > 0;
  const hasTutorEvidence = receipt.tutor !== undefined;

  if (!hasAtomicEvidence && !hasCoachEvidence && !hasTutorEvidence) {
    return null;
  }

  return (
    <section
      className="w-full border-t border-border-soft pt-4 text-left"
      data-testid="learning-evidence-receipt"
      aria-labelledby="learning-evidence-receipt-title"
    >
      <h3
        id="learning-evidence-receipt-title"
        className="text-sm font-semibold text-text"
      >
        {heading}
      </h3>
      <dl className="mt-3 grid gap-y-3 text-sm leading-relaxed">
        {hasAtomicEvidence && (
          <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
            <dt className="font-semibold text-text">Atomic evidence</dt>
            <dd className="text-text-muted">
              {plural(receipt.atomic.recorded, 'atomic receipt')} ·{' '}
              {receipt.atomic.acquisition} acquisition ·{' '}
              {receipt.atomic.retention} retention · {receipt.atomic.transfer}{' '}
              transfer.
              {receipt.timing &&
                timingDetail(
                  receipt.timing.windowMs,
                  receipt.timing.normalizedAtomicReceipts,
                  receipt.atomic.recorded,
                )}
            </dd>
          </div>
        )}
        {hasTutorEvidence && receipt.tutor && (
          <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
            <dt className="font-semibold text-text">Tutor</dt>
            <dd className="text-text-muted">
              {plural(receipt.tutor.interventions, 'intervention')} ·{' '}
              {plural(receipt.tutor.cleanAttempts, 'clean loop')} ·{' '}
              {plural(receipt.tutor.retryAttempts, 'retry')} ·{' '}
              {plural(receipt.tutor.deferredAttempts, 'deferral')}. Recovery is
              practice scaffolding, not a mastery claim.
            </dd>
          </div>
        )}
        {hasCoachEvidence && (
          <div className="grid gap-1 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
            <dt className="font-semibold text-text">Coach route</dt>
            <dd className="text-text-muted">
              {plural(receipt.coach.findings, 'saved finding')} ·{' '}
              {plural(receipt.coach.unresolvedFindings, 'open finding')}
              {receipt.coach.barRanges.length > 0 &&
                ' · bars ' + receipt.coach.barRanges.join(', ')}
              {receipt.coach.remediationLessonIds.length > 0 &&
                ' · loop ' + receipt.coach.remediationLessonIds.join(', ')}
              .
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
