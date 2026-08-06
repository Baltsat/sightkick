/**
 * Guard against a stale cross-arch native build of @julusian/midi.
 *
 * `electron-builder` multi-arch macOS packaging rebuilds native modules for
 * each target arch and leaves the LAST one (often x86_64) in
 * node_modules/@julusian/midi/build/Release/midi.node. The dev/test process
 * then fails to dlopen it on Apple Silicon. This has broken the test suite
 * twice; running `yarn rebuild` fixes it. This guard detects the mismatch
 * before tests run and rebuilds automatically.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const binding = path.join(
  __dirname,
  '..',
  'node_modules',
  '@julusian',
  'midi',
  'build',
  'Release',
  'midi.node',
);

if (!fs.existsSync(binding)) process.exit(0);

let fileArch = '';

try {
  fileArch = execSync(`file "${binding}"`, { encoding: 'utf8' });
} catch {
  process.exit(0);
}

const wantArm = process.arch === 'arm64';
const isArm = fileArch.includes('arm64');
const isX64 = fileArch.includes('x86_64');

if ((wantArm && isArm) || (!wantArm && isX64)) process.exit(0);

console.warn(
  `[ensure-native-arch] midi.node is the wrong architecture for ${process.arch}; running electron-rebuild...`,
);
execSync('yarn rebuild', {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});
