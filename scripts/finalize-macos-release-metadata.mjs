#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  buildBlockMap,
} = require('app-builder-lib/out/targets/blockmap/blockmap');
const { serializeToYaml } = require('builder-util');
const yaml = require('js-yaml');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packageJson = JSON.parse(
  await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
);
const requestedOutput = process.argv[2] || path.join(repoRoot, 'release/build');
const mode = process.argv[3] || '--verify';

assert(
  mode === '--write' || mode === '--verify',
  'Usage: finalize-macos-release-metadata.mjs <output-dir> [--write|--verify]',
);

const outputDir = path.resolve(requestedOutput);
const productName = packageJson.build?.productName;
const version = packageJson.version;
const architecture = 'arm64';

assert(productName === 'Drumroll', 'Unexpected release product name');
assert(version === '1.2.0-kb.2', 'Unexpected release version');

const artifactPrefix = `${productName}-${version}-${architecture}`;
const zipName = `${artifactPrefix}.zip`;
const dmgName = `${artifactPrefix}.dmg`;
const metadataName = 'latest-mac.yml';
const artifactNames = [zipName, dmgName];
const expectedDistributionNames = new Set([
  zipName,
  `${zipName}.blockmap`,
  dmgName,
  `${dmgName}.blockmap`,
  metadataName,
]);

async function requireRegularNonemptyFile(filePath) {
  const fileStats = await stat(filePath);

  assert(fileStats.isFile(), `Expected a regular file: ${filePath}`);
  assert(fileStats.size > 0, `Expected a nonempty file: ${filePath}`);
}

function isDistributionMetadata(name) {
  return /\.(?:dmg|zip)(?:\.blockmap)?$/.test(name) || /-mac\.yml$/.test(name);
}

async function assertDistributionFileSet({
  allowMissingMetadata = false,
} = {}) {
  const entries = await readdir(outputDir, { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isFile() && isDistributionMetadata(entry.name))
    .map((entry) => entry.name)
    .sort();
  const expected = [...expectedDistributionNames].sort();

  if (allowMissingMetadata) {
    const unexpected = actual.filter(
      (name) => !expectedDistributionNames.has(name),
    );

    assert(
      unexpected.length === 0,
      `Unexpected macOS distribution files: ${unexpected.join(', ')}`,
    );

    return;
  }

  assert.deepEqual(
    actual,
    expected,
    'macOS distribution file set is not the exact expected set',
  );
}

async function readExistingReleaseDate(metadataPath) {
  try {
    const existing = yaml.load(await readFile(metadataPath, 'utf8'), {
      schema: yaml.JSON_SCHEMA,
    });
    const value = existing?.releaseDate;

    if (
      typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value
    ) {
      return value;
    }
  } catch {
    // A malformed or absent metadata file must not influence regenerated data.
  }

  return new Date().toISOString();
}

await requireRegularNonemptyFile(path.join(outputDir, zipName));
await requireRegularNonemptyFile(path.join(outputDir, dmgName));
await assertDistributionFileSet({ allowMissingMetadata: mode === '--write' });

const temporaryDir = await mkdtemp(
  path.join(os.tmpdir(), 'drumroll-release-metadata.'),
);

try {
  const artifactInfo = new Map();
  const generatedBlockmaps = new Map();

  for (const artifactName of artifactNames) {
    const artifactPath = path.join(outputDir, artifactName);
    const generatedBlockmap = path.join(
      temporaryDir,
      `${artifactName}.blockmap`,
    );
    const updateInfo = await buildBlockMap(
      artifactPath,
      'gzip',
      generatedBlockmap,
    );

    assert(
      typeof updateInfo.sha512 === 'string' && updateInfo.sha512.length > 0,
      `Missing SHA-512 for ${artifactName}`,
    );
    assert(
      Number.isSafeInteger(updateInfo.size) && updateInfo.size > 0,
      `Missing byte size for ${artifactName}`,
    );
    artifactInfo.set(artifactName, updateInfo);
    generatedBlockmaps.set(artifactName, generatedBlockmap);
  }

  const metadataPath = path.join(outputDir, metadataName);
  const releaseDate = await readExistingReleaseDate(metadataPath);
  const zipInfo = artifactInfo.get(zipName);
  const dmgInfo = artifactInfo.get(dmgName);
  const metadata = {
    version,
    files: [
      { url: zipName, sha512: zipInfo.sha512, size: zipInfo.size },
      { url: dmgName, sha512: dmgInfo.sha512, size: dmgInfo.size },
    ],
    path: zipName,
    sha512: zipInfo.sha512,
    releaseDate,
  };
  let serializedMetadata = serializeToYaml(metadata, false, true);

  if (!serializedMetadata.endsWith('\n')) {
    serializedMetadata += '\n';
  }

  const generatedMetadataPath = path.join(temporaryDir, metadataName);

  await writeFile(generatedMetadataPath, serializedMetadata, 'utf8');

  if (mode === '--write') {
    for (const artifactName of artifactNames) {
      await rename(
        generatedBlockmaps.get(artifactName),
        path.join(outputDir, `${artifactName}.blockmap`),
      );
    }

    await rename(generatedMetadataPath, metadataPath);
  } else {
    for (const artifactName of artifactNames) {
      const actualBlockmap = await readFile(
        path.join(outputDir, `${artifactName}.blockmap`),
      );
      const expectedBlockmap = await readFile(
        generatedBlockmaps.get(artifactName),
      );

      assert(
        actualBlockmap.equals(expectedBlockmap),
        `${artifactName}.blockmap does not describe the final artifact bytes`,
      );
    }

    assert.equal(
      await readFile(metadataPath, 'utf8'),
      serializedMetadata,
      `${metadataName} does not contain the final artifact hashes and sizes`,
    );
  }

  await assertDistributionFileSet();

  for (const name of expectedDistributionNames) {
    await requireRegularNonemptyFile(path.join(outputDir, name));
  }

  console.log(
    `${
      mode === '--write' ? 'Regenerated' : 'Verified'
    } blockmaps and ${metadataName} ` + `for ${zipName} and ${dmgName}.`,
  );
} finally {
  await rm(temporaryDir, { force: true, recursive: true });
}
