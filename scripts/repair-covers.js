#!/usr/bin/env node

/**
 * Repairs album.jpg covers for songs already in a SightKick library that
 * likely got a placeholder or video-thumbnail cover from the auto-chart
 * import path (see src/main/songCover.ts / src/main/albumArtResolver.ts,
 * which now try the iTunes Search API before falling back to embedded
 * artwork or a YouTube thumbnail for *new* imports).
 *
 * This script duplicates that resolver's matching logic (NFKC + feat.
 * normalization, artist-name-overlap, fuzzy title scoring) in plain
 * CommonJS rather than requiring src/main/albumArtResolver.ts directly,
 * since this repo has no ts-node/tsx runtime wired up (the project's
 * TypeScript targets electron-vite's bundler resolution, not standalone
 * `node` execution) and scripts/ is otherwise plain Node — see
 * postinstall.js, clean-userdata.js. Keep the two in sync when tuning the
 * matching heuristics.
 *
 * A folder is a repair candidate when:
 *   - it is not a "SightKick Method - *" lesson folder, AND
 *   - it is not human/Harmonix-charted (a non-empty `charter` while
 *     `auto_chart` isn't "True") with an existing cover already in place
 *     (never touch curated art), AND
 *   - its album.jpg/png/jpeg is missing, OR its song.ini has
 *     auto_chart = True (that cover very likely came from the YouTube
 *     import path, either a raw video thumbnail or an older placeholder
 *     graphic — both are candidates for a real cover).
 *
 * A candidate is only ever rewritten when the iTunes Search API returns a
 * confident artist+title match. The previous cover (if any) is preserved
 * as `<original filename>.bak` next to the new album.jpg — but only when
 * something is actually being replaced, and only once: if a `.bak` already
 * exists for a song, that song is treated as already repaired and skipped,
 * so re-running this script is idempotent instead of clobbering the
 * original artwork on a second pass.
 *
 * Usage:
 *   node scripts/repair-covers.js                 # dry run (default)
 *   node scripts/repair-covers.js --apply          # write changes
 *   node scripts/repair-covers.js --library <path> # override ~/Music/SightKick
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const ini = require('ini');
const DEFAULT_LIBRARY = path.join(os.homedir(), 'Music', 'SightKick');
const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const LESSON_FOLDER_PREFIX = 'SightKick Method - ';
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_SEARCH_TIMEOUT_MS = 8_000;
const MAX_ARTWORK_BYTES = 10_000_000;
const MIN_TITLE_SIMILARITY = 0.6;
// Politeness delay between iTunes requests so a large library doesn't
// hammer the (free, unauthenticated) Search API.
const REQUEST_DELAY_MS = 250;
// ---------------------------------------------------------------------
// Matching (mirrors src/main/albumArtResolver.ts)
// ---------------------------------------------------------------------
const FEATURING_TAG =
  /\s*[([]?\s*(?:feat\.?|ft\.?|featuring)\s+[^()[\]]*[)\]]?\s*$/i;
const ARTIST_SEPARATOR =
  /\s*(?:,|&|\/|\bx\b|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i;

function normalize(value) {
  return value.normalize('NFKC').trim().toLowerCase();
}

function normalizeTitle(title) {
  return normalize(title.replace(FEATURING_TAG, ''));
}

function artistNames(artist) {
  const names = artist
    .split(ARTIST_SEPARATOR)
    .map((name) => normalize(name))
    .filter(Boolean);

  return new Set(names.length > 0 ? names : [normalize(artist)]);
}

function artistsMatch(a, b) {
  const namesB = artistNames(b);

  for (const name of artistNames(a)) {
    if (namesB.has(name)) {
      return true;
    }
  }

  return false;
}

function tokenize(value) {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function titleSimilarity(a, b) {
  if (a === b) {
    return 1;
  }

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.min(tokensA.size, tokensB.size);
}

function upgradeArtworkUrl(url) {
  return url.replace('100x100', '600x600');
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns `{ url, trackName, artistName, score }` for the best confident
 * iTunes match, or undefined. */
async function findItunesArtwork(artist, title) {
  const trimmedArtist = artist.trim();
  const trimmedTitle = title.trim();

  if (!trimmedArtist || !trimmedTitle) {
    return undefined;
  }

  const url = new URL(ITUNES_SEARCH_URL);

  url.searchParams.set('term', `${trimmedArtist} ${trimmedTitle}`);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '5');

  let response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(ITUNES_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    return { error: `iTunes request failed: ${error.message || error}` };
  }

  if (!response.ok) {
    return { error: `iTunes search responded ${response.status}` };
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    return { error: 'iTunes search returned invalid JSON' };
  }

  const results =
    payload && Array.isArray(payload.results) ? payload.results : [];
  const normalizedQueryTitle = normalizeTitle(trimmedTitle);
  let best;

  for (const result of results) {
    if (!result || typeof result !== 'object') {
      continue;
    }

    const { trackName, artistName: resultArtist, artworkUrl100 } = result;

    if (
      typeof trackName !== 'string' ||
      typeof resultArtist !== 'string' ||
      typeof artworkUrl100 !== 'string' ||
      !isHttpsUrl(artworkUrl100)
    ) {
      continue;
    }

    if (!artistsMatch(trimmedArtist, resultArtist)) {
      continue;
    }

    const normalizedTrackTitle = normalizeTitle(trackName);
    const score = titleSimilarity(normalizedTrackTitle, normalizedQueryTitle);

    if (score < MIN_TITLE_SIMILARITY) {
      continue;
    }

    const matchScore =
      score + Number(normalizedTrackTitle === normalizedQueryTitle);

    if (!best || matchScore > best.score) {
      best = {
        url: upgradeArtworkUrl(artworkUrl100),
        trackName,
        artistName: resultArtist,
        score: matchScore,
      };
    }
  }

  return best;
}

/** Downloads `url`, validating https/content-type/size, mirroring
 * src/main/songCover.ts's remoteArtwork safety checks. */
async function downloadArtwork(url) {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('Artwork URL must use HTTPS');
  }

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(ITUNES_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Artwork download failed: ${response.status}`);
  }

  if (response.url) {
    const finalUrl = new URL(response.url);

    if (finalUrl.protocol !== 'https:') {
      throw new Error('Artwork request redirected off HTTPS');
    }
  }

  const contentType = (
    response.headers.get('content-type') || ''
  ).toLowerCase();

  if (!contentType.startsWith('image/')) {
    throw new Error('Artwork URL did not return an image');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > MAX_ARTWORK_BYTES) {
    throw new Error('Artwork image is larger than 10 MB');
  }

  return buffer;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// Library scan
// ---------------------------------------------------------------------

function existingCoverFile(dir) {
  return COVER_EXTENSIONS.map((extension) =>
    path.join(dir, `album.${extension}`),
  ).find((file) => fs.existsSync(file));
}

function readSongMeta(dir) {
  const iniPath = path.join(dir, 'song.ini');

  if (!fs.existsSync(iniPath)) {
    return undefined;
  }

  const raw = fs
    .readFileSync(iniPath, 'utf8')
    .replace(/<color=[^>]*>(.*?)<\/color>/g, '$1');
  const parsed = ini.parse(raw);

  return parsed.song || parsed.Song || parsed;
}

function alreadyRepaired(dir) {
  return COVER_EXTENSIONS.some((extension) =>
    fs.existsSync(path.join(dir, `album.${extension}.bak`)),
  );
}

function releaseIdentity(meta) {
  const artist = String(meta?.artist || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
  const title = String(meta?.name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
  const album = String(meta?.album || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

  return artist && title && album
    ? `${artist}\u0000${title}\u0000${album}`
    : undefined;
}

/** Decides whether `dir` is a repair candidate, returning
 * `{ candidate: boolean, reason: string }`. */
function classify(dir, meta, coverFile) {
  const name = path.basename(dir);

  if (name.startsWith(LESSON_FOLDER_PREFIX)) {
    return { candidate: false, reason: 'lesson folder' };
  }

  if (!meta) {
    return { candidate: false, reason: 'no song.ini' };
  }

  if (alreadyRepaired(dir)) {
    return { candidate: false, reason: 'already repaired (a .bak is present)' };
  }

  const autoChartTrue =
    String(meta.auto_chart || '')
      .trim()
      .toLowerCase() === 'true';
  const charter = String(meta.charter || '').trim();
  const humanCharted = charter.length > 0 && !autoChartTrue;

  if (humanCharted && coverFile) {
    return {
      candidate: false,
      reason: `human/Harmonix-charted ("${charter}") with existing art`,
    };
  }

  if (!coverFile) {
    return { candidate: true, reason: 'missing cover' };
  }

  if (autoChartTrue) {
    return {
      candidate: true,
      reason: 'auto_chart=True (likely a video-thumbnail/placeholder cover)',
    };
  }

  return { candidate: false, reason: 'has cover, not auto-charted' };
}

function writeCoverAtomically(dir, buffer) {
  const finalPath = path.join(dir, 'album.jpg');
  const tempPath = path.join(dir, `.album.jpg.${randomUUID()}.tmp`);

  fs.writeFileSync(tempPath, buffer);

  try {
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });

    throw error;
  }
}

async function repairSong(dir, meta, coverFile, sharedReleaseCover, apply) {
  const artist = String(meta.artist || '').trim();
  const title = String(meta.name || '').trim();

  if (!artist || !title) {
    return {
      status: 'skipped',
      reason: 'song.ini has no artist/name to search with',
    };
  }

  if (!coverFile && sharedReleaseCover) {
    const detail = 'copied existing art for the same artist, song, and album';

    if (!apply) {
      return { status: 'would-repair', reason: detail };
    }

    writeCoverAtomically(dir, fs.readFileSync(sharedReleaseCover));

    return { status: 'repaired', reason: detail };
  }

  const match = await findItunesArtwork(artist, title);

  if (!match) {
    return { status: 'skipped', reason: 'no confident iTunes match' };
  }

  if (match.error) {
    return { status: 'skipped', reason: match.error };
  }

  const detail = `matched "${match.trackName}" by "${
    match.artistName
  }" (score ${match.score.toFixed(2)})`;

  if (!apply) {
    return { status: 'would-repair', reason: detail };
  }

  let buffer;

  try {
    buffer = await downloadArtwork(match.url);
  } catch (error) {
    return { status: 'skipped', reason: `download failed: ${error.message}` };
  }

  if (coverFile) {
    fs.renameSync(coverFile, `${coverFile}.bak`);
  }

  writeCoverAtomically(dir, buffer);

  return { status: 'repaired', reason: detail };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const libraryIndex = args.indexOf('--library');
  const library =
    libraryIndex >= 0 && args[libraryIndex + 1]
      ? args[libraryIndex + 1]
      : DEFAULT_LIBRARY;

  if (!fs.existsSync(library)) {
    console.error(`Library folder not found: ${library}`);
    process.exitCode = 1;

    return;
  }

  console.log(`SightKick cover repair — ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Library: ${library}\n`);

  const entries = fs
    .readdirSync(library, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const librarySongs = entries.map((name) => {
    const dir = path.join(library, name);

    return {
      dir,
      name,
      meta: readSongMeta(dir),
      coverFile: existingCoverFile(dir),
    };
  });
  const releaseCovers = new Map();

  for (const song of librarySongs) {
    const identity = releaseIdentity(song.meta);

    if (identity && song.coverFile) {
      releaseCovers.set(identity, song.coverFile);
    }
  }

  const summary = { repaired: 0, wouldRepair: 0, skipped: 0 };

  for (const { dir, name, meta, coverFile } of librarySongs) {
    const { candidate, reason: skipReason } = classify(dir, meta, coverFile);

    if (!candidate) {
      continue;
    }

    // to stay polite to the free, unauthenticated iTunes Search API.
    const result = await repairSong(
      dir,
      meta,
      coverFile,
      releaseCovers.get(releaseIdentity(meta)),
      apply,
    );

    if (result.status === 'repaired') {
      summary.repaired += 1;
      console.log(`[repaired]     ${name}\n               ${result.reason}`);
    } else if (result.status === 'would-repair') {
      summary.wouldRepair += 1;
      console.log(`[would-repair] ${name}\n               ${result.reason}`);
    } else {
      summary.skipped += 1;
      console.log(
        `[skipped]      ${name} (candidate: ${skipReason})\n               ${result.reason}`,
      );
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log('');
  console.log(
    apply
      ? `Repaired ${summary.repaired}, skipped ${summary.skipped}.`
      : `Would repair ${summary.wouldRepair}, would skip ${summary.skipped}. Re-run with --apply to write changes.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
