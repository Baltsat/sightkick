import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const manifests = [
  {
    file: 'yandex-drums-2026-08-09.json',
    trackCount: 13,
    stableUrlCount: 11,
    missingUrlOrdinals: [6, 9],
    privateOnlyOrdinals: [],
  },
  {
    file: 'yandex-favorites-2026-08-10.json',
    trackCount: 230,
    stableUrlCount: 211,
    missingUrlOrdinals: [
      88, 98, 117, 120, 142, 147, 149, 152, 153, 167, 169, 170, 173, 183, 192,
      196, 197, 201, 209,
    ],
    privateOnlyOrdinals: [88],
  },
];

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function canonicalHash(manifest) {
  const copy = structuredClone(manifest);

  delete copy.integrity.canonicalSha256;

  return crypto
    .createHash('sha256')
    .update(canonicalize(copy), 'utf8')
    .digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function visit(value, pathName = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${pathName}[${index}]`));

    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  Object.entries(value).forEach(([key, nested]) => {
    assert(
      !/(audio|stream|download|playable|playback)/i.test(key),
      `${pathName}.${key} is an out-of-scope media/playability field`,
    );
    visit(nested, `${pathName}.${key}`);
  });
}

function validateManifest(spec) {
  const sourcePath = path.join(
    repoRoot,
    'resources/library-sources',
    spec.file,
  );
  const manifest = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const { tracks, playlist, completeness, integrity } = manifest;

  assert(
    manifest.schemaVersion === 2,
    `${spec.file} must use schema version 2`,
  );
  assert(manifest.source === 'yandex-music', `${spec.file} has wrong source`);
  assert(
    playlist.rightsScope === 'metadata-only',
    `${spec.file} is not metadata-only`,
  );
  assert(
    typeof playlist.capturedAt === 'string',
    `${spec.file} lacks capture time`,
  );
  assert(
    tracks.length === spec.trackCount,
    `${spec.file} track count mismatch`,
  );
  assert(
    completeness.declaredTrackCount === spec.trackCount &&
      completeness.renderedTrackCount === spec.trackCount,
    `${spec.file} completeness count mismatch`,
  );
  assert(
    tracks.every((track, index) => track.ordinal === index + 1),
    `${spec.file} ordinals are not contiguous`,
  );

  const stableUrls = tracks
    .map((track) => track.sourceTrackUrl)
    .filter((url) => url !== null);
  const missingUrlOrdinals = tracks
    .filter((track) => track.sourceTrackUrl === null)
    .map((track) => track.ordinal);
  const privateOnlyOrdinals = tracks
    .filter((track) => track.sourceAvailability === 'private')
    .map((track) => track.ordinal);

  assert(
    stableUrls.length === spec.stableUrlCount &&
      completeness.stableSourceTrackUrlCount === spec.stableUrlCount,
    `${spec.file} stable URL count mismatch`,
  );
  assert(
    new Set(stableUrls).size === stableUrls.length,
    `${spec.file} has duplicate stable source URLs`,
  );
  assert(
    JSON.stringify(missingUrlOrdinals) ===
      JSON.stringify(spec.missingUrlOrdinals),
    `${spec.file} missing stable URL ordinals mismatch`,
  );
  assert(
    JSON.stringify(completeness.noVisibleStableSourceTrackUrlOrdinals) ===
      JSON.stringify(spec.missingUrlOrdinals),
    `${spec.file} declared missing URL ordinals mismatch`,
  );
  assert(
    JSON.stringify(privateOnlyOrdinals) ===
      JSON.stringify(spec.privateOnlyOrdinals),
    `${spec.file} private-only ordinals mismatch`,
  );
  assert(
    JSON.stringify(completeness.privateOnlyOrdinals) ===
      JSON.stringify(spec.privateOnlyOrdinals),
    `${spec.file} declared private-only ordinals mismatch`,
  );
  assert(
    canonicalHash(manifest) === integrity.canonicalSha256,
    `${spec.file} canonical SHA-256 does not reproduce`,
  );

  visit(manifest);

  return `${spec.file}: ${tracks.length} rows, ${stableUrls.length} stable URLs`;
}

console.log(manifests.map(validateManifest).join('\n'));
