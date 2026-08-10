import { describe, expect, it } from 'vitest';
import { chartContentRevision } from './chart-revision';

function revision(fileData: Uint8Array, format: 'mid' | 'chart' = 'mid') {
  return chartContentRevision({
    songId: 'lesson:01.01',
    difficulty: 'expert',
    format,
    fileData,
  });
}

describe('chartContentRevision', () => {
  it('is stable for the same exact authored payload', () => {
    expect(revision(new Uint8Array([1, 2, 3]))).toBe(
      revision(new Uint8Array([1, 2, 3])),
    );
  });

  it('changes when chart bytes change under the same song and lesson ID', () => {
    expect(revision(new Uint8Array([1, 2, 3]))).not.toBe(
      revision(new Uint8Array([1, 2, 4])),
    );
  });

  it('includes the parser format so equal bytes with different semantics do not collide', () => {
    expect(revision(new Uint8Array([1, 2, 3]), 'mid')).not.toBe(
      revision(new Uint8Array([1, 2, 3]), 'chart'),
    );
  });
});
