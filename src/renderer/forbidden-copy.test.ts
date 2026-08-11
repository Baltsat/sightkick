import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const textExtensions = new Set([
  '.css',
  '.html',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const excludedParts = new Set(['docs', 'test', 'tests', 'tmp', '__tests__']);
const forbiddenCopy = /support\s+(?:the\s+)?project/i;

function isExcluded(path: string) {
  const parts = relative(root, path).split(sep);
  const name = parts.at(-1) ?? '';

  return (
    parts.some((part) => excludedParts.has(part)) ||
    /\.(?:test|spec)\.[^.]+$/.test(name)
  );
}

function textFiles(path: string): string[] {
  if (isExcluded(path)) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(path, entry.name);

    if (entry.isDirectory()) {
      return textFiles(entryPath);
    }

    return textExtensions.has(extname(entry.name)) ? [entryPath] : [];
  });
}

describe('forbidden user-facing copy', () => {
  it('never ships project-support language in renderer or packaged resource text', () => {
    const scannedRoots = [
      resolve(root, 'src/renderer'),
      resolve(root, 'resources'),
      resolve(root, 'web/public/library'),
    ];
    const violations = scannedRoots
      .flatMap(textFiles)
      .filter((path) => forbiddenCopy.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));

    expect(violations).toEqual([]);
  });
});
