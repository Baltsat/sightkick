import type { Difficulty } from 'scan-chart';

const FNV_64_OFFSET = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;

/**
 * Content-addressed chart identity for durable run/remediation evidence.
 * Directory mtimes and lesson IDs are not revisions: a notes.mid edit can
 * retain both. Hashing the exact bytes invalidates stale queues whenever the
 * authored chart changes, while staying synchronous for render-time use.
 */
export function chartContentRevision({
  songId,
  difficulty,
  format,
  fileData,
}: {
  songId: string | undefined;
  difficulty: Difficulty;
  format: 'mid' | 'chart';
  fileData: (ArrayLike<number> & { readonly byteLength: number }) | undefined;
}): string {
  if (!fileData) {
    return `${songId ?? 'unknown'}:${difficulty}:${format}:pending`;
  }

  let hash = FNV_64_OFFSET;

  for (let index = 0; index < fileData.length; index += 1) {
    const byte = fileData[index];

    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME);
  }

  return `${songId ?? 'unknown'}:${difficulty}:${format}:fnv1a64-${hash
    .toString(16)
    .padStart(16, '0')}-${fileData.byteLength}`;
}
