#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_version="$(node -e 'const package_json = require(process.argv[1]); process.stdout.write(package_json.version)' "$repo_root/package.json")"
expected_short_version="$(node -e 'const package_json = require(process.argv[1]); process.stdout.write(package_json.build.mac.bundleShortVersion)' "$repo_root/package.json")"
expected_build_version="$(node -e 'const package_json = require(process.argv[1]); process.stdout.write(package_json.build.mac.bundleVersion)' "$repo_root/package.json")"
target_path="${1:-$repo_root/release/build/mac-arm64/Drumroll.app}"
dmg_path=""
mount_dir=""
mounted=0

cleanup() {
    if [[ "$mounted" -eq 1 ]]; then
        hdiutil detach "$mount_dir" >/dev/null
    fi
    if [[ -n "$mount_dir" && -d "$mount_dir" ]]; then
        rmdir "$mount_dir" 2>/dev/null || true
    fi
}
trap cleanup EXIT

if [[ "$target_path" == *.dmg ]]; then
    if [[ ! -f "$target_path" ]]; then
        echo "Missing packaged disk image: $target_path" >&2
        exit 1
    fi

    dmg_path="$(cd "$(dirname "$target_path")" && pwd)/$(basename "$target_path")"
    if [[ "$(basename "$dmg_path")" != "Drumroll-$release_version-arm64.dmg" ]]; then
        echo "Unexpected disk image name: $dmg_path" >&2
        exit 1
    fi
    mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/drumroll-dmg-verify.XXXXXX")"
    hdiutil attach "$dmg_path" \
        -readonly \
        -nobrowse \
        -mountpoint "$mount_dir" >/dev/null
    mounted=1

    resolved_mount_dir="$(cd "$mount_dir" && pwd -P)"
    if ! mount | grep -F "on $resolved_mount_dir " | grep -q 'read-only'; then
        echo "Disk image was not mounted read-only: $dmg_path" >&2
        exit 1
    fi

    shopt -s nullglob
    mounted_apps=("$mount_dir"/*.app)
    shopt -u nullglob
    if [[ "${#mounted_apps[@]}" -ne 1 ]]; then
        echo "Expected exactly one application in $dmg_path; found ${#mounted_apps[@]}." >&2
        exit 1
    fi
    target_path="${mounted_apps[0]}"
fi

if [[ ! -d "$target_path" ]]; then
    echo "Missing packaged app: $target_path" >&2
    exit 1
fi

if [[ "$(basename "$target_path")" != 'Drumroll.app' ]]; then
    echo "Expected the exact application name Drumroll.app, got: $target_path" >&2
    exit 1
fi

info_plist="$target_path/Contents/Info.plist"
resources_path="$target_path/Contents/Resources"

if [[ ! -f "$info_plist" || ! -d "$resources_path" ]]; then
    echo "Incomplete Drumroll application bundle: $target_path" >&2
    exit 1
fi

short_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")"
build_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info_plist")"
bundle_identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")"
minimum_system_version="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$info_plist")"

if [[ "$short_version" != "$expected_short_version" ]]; then
    echo "Expected CFBundleShortVersionString $expected_short_version, got $short_version" >&2
    exit 1
fi
if [[ "$build_version" != "$expected_build_version" ]]; then
    echo "Expected CFBundleVersion $expected_build_version, got $build_version" >&2
    exit 1
fi
if [[ "$bundle_identifier" != 'org.sk.SightKick' ]]; then
    echo "Unexpected bundle identifier: $bundle_identifier" >&2
    exit 1
fi
if [[ "$minimum_system_version" != '12.0' ]]; then
    echo "Expected LSMinimumSystemVersion 12.0, got $minimum_system_version" >&2
    exit 1
fi

node - "$resources_path" "$repo_root" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const resourcesPath = process.argv[2];
const repoRoot = process.argv[3];
const integrityPath = path.join(resourcesPath, 'distribution-integrity.json');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
);
const expectedReleaseVersion = packageJson.version;
const expectedShortVersion = packageJson.build?.mac?.bundleShortVersion;
const expectedBuildVersion = packageJson.build?.mac?.bundleVersion;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function verifyRecord(filePath, expected, label) {
  assert(fs.existsSync(filePath), `Missing ${label}: ${filePath}`);
  const stats = fs.statSync(filePath);
  assert(stats.isFile(), `${label} is not a regular file: ${filePath}`);
  assert(stats.size === expected.bytes, `${label} byte count changed`);
  assert(sha256(filePath) === expected.sha256, `${label} SHA-256 changed`);
}

function walkFiles(root, relative = '') {
  return fs
    .readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      const child = path.join(relative, entry.name);
      assert(!entry.isSymbolicLink(), `Packaged data must not be a symlink: ${child}`);
      if (entry.isDirectory()) {
        return walkFiles(root, child);
      }
      assert(entry.isFile(), `Unsupported packaged data: ${child}`);
      return [child.split(path.sep).join('/')];
    });
}

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

function canonicalManifestHash(manifest) {
  const copy = structuredClone(manifest);
  delete copy.integrity.canonicalSha256;
  return crypto
    .createHash('sha256')
    .update(canonicalize(copy), 'utf8')
    .digest('hex');
}

assert(fs.existsSync(integrityPath), 'Missing distribution-integrity.json');
const integrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
assert(integrity.schemaVersion === 2, 'Unsupported distribution integrity schema');
assert(integrity.application.productName === 'Drumroll', 'Wrong product name');
assert(integrity.application.releaseVersion === expectedReleaseVersion, 'Wrong release version');
assert(integrity.application.shortVersion === expectedShortVersion, 'Wrong short version');
assert(integrity.application.buildVersion === expectedBuildVersion, 'Wrong build version');

const lessonRoot = path.join(resourcesPath, 'lesson-library');
const lessonManifestPath = path.join(lessonRoot, 'manifest.json');
assert(fs.existsSync(lessonManifestPath), 'Missing packaged lesson manifest');
const lessonManifest = JSON.parse(fs.readFileSync(lessonManifestPath, 'utf8'));
assert(lessonManifest.lessonCount === 170, 'Lesson manifest count is not 170');
assert(lessonManifest.lessons?.length === 170, 'Lesson row count is not 170');
assert(integrity.lessonLibrary.lessonCount === 170, 'Integrity lesson count is not 170');

const expectedLessonFiles = integrity.lessonLibrary.files;
assert(Array.isArray(expectedLessonFiles), 'Missing lesson file integrity records');
const expectedPaths = expectedLessonFiles.map((entry) => entry.path);
assert(
  new Set(expectedPaths).size === expectedPaths.length,
  'Duplicate lesson paths in distribution integrity manifest',
);
for (const relativePath of expectedPaths) {
  assert(
    !path.isAbsolute(relativePath) && !relativePath.split('/').includes('..'),
    `Unsafe lesson path in integrity manifest: ${relativePath}`,
  );
}

const actualLessonFiles = walkFiles(lessonRoot);
assert(
  JSON.stringify(actualLessonFiles) === JSON.stringify(expectedPaths),
  'Packaged lesson file set differs from the integrity manifest',
);
expectedLessonFiles.forEach((entry) =>
  verifyRecord(path.join(lessonRoot, entry.path), entry, `lesson file ${entry.path}`),
);

const sourceLessonRoot = path.join(repoRoot, 'web/public/library');
assert(fs.existsSync(sourceLessonRoot), 'Missing source lesson library for equality check');
assert(
  JSON.stringify(walkFiles(sourceLessonRoot)) === JSON.stringify(expectedPaths),
  'Source lesson file set differs from the packaged integrity manifest',
);
expectedLessonFiles.forEach((entry) => {
  const sourcePath = path.join(sourceLessonRoot, entry.path);
  verifyRecord(sourcePath, entry, `source lesson file ${entry.path}`);
  assert(
    fs.readFileSync(sourcePath).equals(fs.readFileSync(path.join(lessonRoot, entry.path))),
    `Source and packaged lesson bytes differ: ${entry.path}`,
  );
});

const lessonIds = new Set();
const lessonDirectories = new Set();
const requiredLessonFiles = [
  'drums.ogg',
  'notes.mid',
  'song.ini',
  'song.ogg',
  'sticking.json',
];
let totalAssetBytes = 0;
let maxAssetBytes = 0;

for (const entry of expectedLessonFiles) {
  if (entry.path === 'manifest.json') {
    continue;
  }
  totalAssetBytes += entry.bytes;
  maxAssetBytes = Math.max(maxAssetBytes, entry.bytes);
}
assert(totalAssetBytes === lessonManifest.totalBytes, 'Lesson totalBytes is not reproducible');
assert(maxAssetBytes === lessonManifest.maxFileBytes, 'Lesson maxFileBytes is not reproducible');

for (const lesson of lessonManifest.lessons) {
  const lessonId = lesson.song?.lesson?.id;
  assert(typeof lessonId === 'string' && lessonId.length > 0, 'Lesson is missing a stable ID');
  assert(!lessonIds.has(lessonId), `Duplicate lesson ID: ${lessonId}`);
  lessonIds.add(lessonId);

  assert(
    typeof lesson.song?.dir === 'string' && lesson.song.dir.startsWith('/library/'),
    `Lesson ${lessonId} has an invalid directory`,
  );
  const directory = decodeURIComponent(lesson.song.dir.slice('/library/'.length));
  assert(directory && !directory.includes('/') && !directory.includes('..'), `Unsafe lesson directory: ${directory}`);
  assert(!lessonDirectories.has(directory), `Duplicate lesson directory: ${directory}`);
  lessonDirectories.add(directory);

  assert(
    JSON.stringify([...lesson.files].sort()) === JSON.stringify(requiredLessonFiles),
    `Lesson ${lessonId} does not declare the exact five required assets`,
  );
  assert(lesson.chart === `${lesson.song.dir}/notes.mid`, `Lesson ${lessonId} chart path is inconsistent`);
  assert(
    JSON.stringify(lesson.song.audio?.map((audio) => audio.name).sort()) ===
      JSON.stringify(['drums.ogg', 'song.ogg']),
    `Lesson ${lessonId} audio declarations are incomplete`,
  );
  requiredLessonFiles.forEach((fileName) => {
    assert(
      expectedPaths.includes(`${directory}/${fileName}`),
      `Lesson ${lessonId} is missing ${fileName}`,
    );
  });
}
assert(lessonIds.size === 170, 'Did not verify 170 unique lesson IDs');
assert(lessonDirectories.size === 170, 'Did not verify 170 unique lesson directories');

// The main process requires @julusian/midi before it evaluates a single line
// of our own code. If its native binding is missing from the package, the app
// throws at startup, Electron puts up a modal error box, and the window never
// appears - a build that signs, notarizes and passes Gatekeeper while being
// completely dead. That happened on 2026-08-17, from a stray
// node_modules/node_modules symlink that made electron-builder pack the dev
// tree instead of the real dependency layout. Fail here instead.
const unpackedRoot = path.join(resourcesPath, 'app.asar.unpacked');
const midiBindingPath = path.join(
  unpackedRoot,
  'node_modules/@julusian/midi/build/Release/midi.node',
);
assert(
  fs.existsSync(midiBindingPath),
  'The packaged app has no @julusian/midi native binding, so it cannot start',
);
assert(
  !fs.existsSync(path.join(unpackedRoot, 'node_modules/node_modules')),
  'The package contains a nested node_modules/node_modules - the dependency layout is wrong',
);

const sourceSpecs = {
  'yandex-drums-2026-08-09.json': 13,
  'yandex-favorites-2026-08-10.json': 230,
};
for (const [fileName, trackCount] of Object.entries(sourceSpecs)) {
  const packagedPath = path.join(resourcesPath, 'library-sources', fileName);
  const sourcePath = path.join(repoRoot, 'resources/library-sources', fileName);
  const webSourcePath = path.join(repoRoot, 'web/public/library-sources', fileName);
  const record = integrity.librarySources[fileName];
  assert(record?.trackCount === trackCount, `${fileName} integrity count changed`);
  verifyRecord(packagedPath, record, `packaged ${fileName}`);
  verifyRecord(sourcePath, record, `source ${fileName}`);
  verifyRecord(webSourcePath, record, `web source ${fileName}`);
  const packagedBytes = fs.readFileSync(packagedPath);
  assert(packagedBytes.equals(fs.readFileSync(sourcePath)), `${fileName} differs from its source`);
  assert(packagedBytes.equals(fs.readFileSync(webSourcePath)), `${fileName} differs from its web copy`);

  const manifest = JSON.parse(packagedBytes.toString('utf8'));
  assert(manifest.schemaVersion === 2, `${fileName} has the wrong schema`);
  assert(manifest.source === 'yandex-music', `${fileName} has the wrong source`);
  assert(manifest.playlist?.rightsScope === 'metadata-only', `${fileName} is not metadata-only`);
  assert(manifest.tracks?.length === trackCount, `${fileName} row count changed`);
  assert(
    manifest.tracks.every((track, index) => track.ordinal === index + 1),
    `${fileName} ordinals are not contiguous`,
  );
  assert(
    canonicalManifestHash(manifest) === record.canonicalSha256 &&
      record.canonicalSha256 === manifest.integrity.canonicalSha256,
    `${fileName} canonical SHA-256 is not reproducible`,
  );
}

const noticeSpecs = {
  'Drumroll-MIT.txt': path.join(repoRoot, 'LICENSE'),
  'THIRD_PARTY_NOTICES.md': path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'),
};
for (const [fileName, sourcePath] of Object.entries(noticeSpecs)) {
  const packagedPath = path.join(resourcesPath, 'licenses', fileName);
  const record = integrity.notices[fileName];
  verifyRecord(packagedPath, record, `packaged notice ${fileName}`);
  verifyRecord(sourcePath, record, `source notice ${fileName}`);
  assert(
    fs.readFileSync(packagedPath).equals(fs.readFileSync(sourcePath)),
    `Packaged notice differs from source: ${fileName}`,
  );
}

const transcriberRoot = path.join(resourcesPath, 'transcriber');
const sourceTranscriberRoot = path.join(repoRoot, 'resources', 'transcriber');
const expectedTranscriberPaths = [
  'README.md',
  'pyproject.toml',
  'run.sh',
  'sk_transcriber/__init__.py',
  'sk_transcriber/__main__.py',
  'sk_transcriber/audio_utils.py',
  'sk_transcriber/beats.py',
  'sk_transcriber/cli.py',
  'sk_transcriber/difficulty.py',
  'sk_transcriber/download.py',
  'sk_transcriber/events.py',
  'sk_transcriber/logging_setup.py',
  'sk_transcriber/midi_writer.py',
  'sk_transcriber/naming.py',
  'sk_transcriber/separate.py',
  'sk_transcriber/songini.py',
  'sk_transcriber/tempo.py',
  'sk_transcriber/transcribe.py',
  'uv.lock',
].sort((left, right) => left.localeCompare(right, 'en'));
const packagedTranscriberPaths = walkFiles(transcriberRoot);
assert(
  JSON.stringify(packagedTranscriberPaths) ===
    JSON.stringify(expectedTranscriberPaths),
  `Packaged transcriber file set is not exact: ${packagedTranscriberPaths.join(', ')}`,
);
for (const relativePath of expectedTranscriberPaths) {
  const packagedPath = path.join(transcriberRoot, relativePath);
  const sourcePath = path.join(sourceTranscriberRoot, relativePath);
  assert(fs.existsSync(sourcePath), `Missing source transcriber file: ${relativePath}`);
  assert(
    fs.readFileSync(packagedPath).equals(fs.readFileSync(sourcePath)),
    `Packaged transcriber differs from source: ${relativePath}`,
  );
}
assert(
  (fs.statSync(path.join(transcriberRoot, 'run.sh')).mode & 0o111) !== 0,
  'Packaged transcriber run.sh is not executable',
);

const thirdPartyNotice = fs.readFileSync(noticeSpecs['THIRD_PARTY_NOTICES.md'], 'utf8');
[
  'https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz',
  '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c',
  'https://ffmpeg.org/legal.html',
  'LGPL',
  'scripts/prepare-ffmpeg-runtime.sh',
  '--enable-nonfree',
].forEach((requiredText) =>
  assert(thirdPartyNotice.includes(requiredText), `Third-party notice lacks ${requiredText}`),
);

const ffmpegRoot = path.join(resourcesPath, 'ffmpeg-runtime');
const sourceFfmpegRoot = path.join(
  repoRoot,
  'node_modules',
  '.cache',
  'drumroll-ffmpeg',
  'macos-arm64',
);
assert(integrity.ffmpeg.runtimeId === 'ffmpeg-8.1.2-drumroll-lgpl-macos-arm64', 'Wrong FFmpeg runtime');
assert(integrity.ffmpeg.version === '8.1.2', 'Wrong FFmpeg version');
assert(integrity.ffmpeg.license === 'LGPL-2.1-or-later', 'Wrong FFmpeg license');
assert(integrity.ffmpeg.architecture === 'arm64', 'Wrong FFmpeg architecture');
assert(integrity.ffmpeg.minimumMacOSVersion === '12.0', 'Wrong FFmpeg deployment target');
assert(
  integrity.ffmpeg.source.sha256 ===
    '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c',
  'Wrong FFmpeg source SHA-256',
);
['--enable-gpl', '--enable-version3', '--enable-nonfree'].forEach((flag) =>
  assert(!integrity.ffmpeg.configurationLine.includes(flag), `Forbidden FFmpeg flag: ${flag}`),
);
['--disable-autodetect', '--disable-network', '--disable-everything'].forEach((flag) =>
  assert(integrity.ffmpeg.configurationLine.includes(flag), `FFmpeg lacks ${flag}`),
);
for (const dependencies of Object.values(integrity.ffmpeg.linkedLibraries)) {
  dependencies.forEach((dependency) =>
    assert(
      dependency.startsWith('/usr/lib/') ||
        dependency.startsWith('/System/Library/Frameworks/'),
      `FFmpeg has a non-system dependency: ${dependency}`,
    ),
  );
}

const expectedFfmpegFiles = integrity.ffmpeg.files;
const expectedFfmpegPaths = expectedFfmpegFiles.map((entry) => entry.path);
assert(
  JSON.stringify(walkFiles(ffmpegRoot)) === JSON.stringify(expectedFfmpegPaths),
  'Packaged FFmpeg file set differs from integrity metadata',
);
assert(
  JSON.stringify(walkFiles(sourceFfmpegRoot)) === JSON.stringify(expectedFfmpegPaths),
  'Source FFmpeg file set differs from integrity metadata',
);
for (const entry of expectedFfmpegFiles) {
  const sourcePath = path.join(sourceFfmpegRoot, entry.path);
  const packagedPath = path.join(ffmpegRoot, entry.path);

  verifyRecord(sourcePath, entry, `source FFmpeg file ${entry.path}`);
  if (entry.path.startsWith('bin/')) {
    assert(fs.statSync(packagedPath).isFile(), `Missing packaged FFmpeg binary ${entry.path}`);
  } else {
    verifyRecord(packagedPath, entry, `packaged FFmpeg file ${entry.path}`);
    assert(
      fs.readFileSync(packagedPath).equals(fs.readFileSync(sourcePath)),
      `Packaged FFmpeg metadata differs from source: ${entry.path}`,
    );
  }
}

console.log(
  `Verified ${lessonIds.size} lessons, ${expectedLessonFiles.length} lesson files, ` +
    '13 Drums rows, 230 Favorites rows, the exact transcriber, notices, FFmpeg source inputs, hashes, and source equality.',
);
NODE

node "$repo_root/scripts/verify-ffmpeg-runtime.mjs" \
    "$resources_path/ffmpeg-runtime" \
    --packaged

expected_authority='Developer ID Application: Konstantin Baltsat (3BGK34ZGS6)'
expected_team_id='3BGK34ZGS6'

codesign --verify --deep --strict --verbose=2 "$target_path"
signature_details="$(codesign -dvvv --entitlements :- "$target_path" 2>&1)"
if ! grep -Fq "Authority=$expected_authority" <<<"$signature_details"; then
    echo "Drumroll is not signed with the expected Developer ID Application identity." >&2
    exit 1
fi
if ! grep -Fq "TeamIdentifier=$expected_team_id" <<<"$signature_details"; then
    echo "Drumroll is not signed by the expected Apple Developer team." >&2
    exit 1
fi
if ! grep -Eq 'flags=.*runtime' <<<"$signature_details"; then
    echo "Drumroll does not have the hardened runtime signing flag." >&2
    exit 1
fi
xcrun stapler validate "$target_path"
spctl --assess --type execute --verbose=2 "$target_path"

if [[ -n "$dmg_path" ]]; then
    codesign --verify --strict --verbose=2 "$dmg_path"
    dmg_signature_details="$(codesign -dvvv "$dmg_path" 2>&1)"
    if ! grep -Fq "Authority=$expected_authority" <<<"$dmg_signature_details"; then
        echo "The DMG is not signed with the expected Developer ID Application identity." >&2
        exit 1
    fi
    if ! grep -Fq "TeamIdentifier=$expected_team_id" <<<"$dmg_signature_details"; then
        echo "The DMG is not signed by the expected Apple Developer team." >&2
        exit 1
    fi
    xcrun stapler validate "$dmg_path"
    spctl --assess \
        --type open \
        --context context:primary-signature \
        --verbose=4 \
        "$dmg_path"
fi

verified_artifacts='stapled app ticket'
if [[ -n "$dmg_path" ]]; then
    verified_artifacts='stapled app and disk image tickets'
fi
echo "Verified Drumroll $short_version ($build_version): exact bundle, curriculum, library sources, transcriber, licenses, expected Developer ID team, hardened runtime, $verified_artifacts, and Gatekeeper acceptance."
