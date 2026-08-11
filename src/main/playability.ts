import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  LibrarySourceTrackProvenance,
  PlayabilityEvidence,
  SongData,
} from '../types';
import {
  isPlayableEvidence,
  playabilityBlockers,
} from '../library-sources/playability';
import { buildSongFromDir, parseLibrarySourceProvenance } from './util';

function hashFiles(files: readonly string[]): string {
  const hash = createHash('sha256');

  for (const file of [...files].sort()) {
    hash.update(path.basename(file));
    hash.update('\0');
    hash.update(fs.readFileSync(file).toString('base64'), 'base64');
    hash.update('\0');
  }

  return hash.digest('hex');
}

function preparedFiles(
  dir: string,
  song: SongData,
): {
  chartPath: string;
  audioPaths: string[];
} {
  const chartPath = path.join(
    dir,
    song.format === 'mid' ? 'notes.mid' : 'notes.chart',
  );
  const audioPaths = song.audio.map((audio) => {
    const extensions = ['.ogg', '.opus', '.mp3'];
    const file = extensions
      .map((extension) => path.join(dir, `${audio.name}${extension}`))
      .find((candidate) => fs.existsSync(candidate));

    if (!file) {
      throw new Error(`Prepared song audio is missing: ${audio.name}`);
    }

    return file;
  });

  if (!fs.existsSync(chartPath) || audioPaths.length === 0) {
    throw new Error('Prepared song cannot pass the headless launch check');
  }

  return { chartPath, audioPaths };
}

function exactIdentity(
  source: LibrarySourceTrackProvenance,
  evidence: PlayabilityEvidence,
): boolean {
  return (
    source.title === evidence.identity.title &&
    source.durationSeconds === evidence.identity.durationSeconds &&
    source.artists.length === evidence.identity.artists.length &&
    source.artists.every(
      (artist, index) => artist === evidence.identity.artists[index],
    )
  );
}

export function createLocalAutoChartEvidence(
  sourceDir: string,
  source: LibrarySourceTrackProvenance,
  chartId: string,
  verifiedAt = new Date().toISOString(),
): PlayabilityEvidence {
  if (!source.durationSeconds) {
    throw new Error(
      'Source row has no duration, so it cannot be auto-charted safely',
    );
  }

  const song = buildSongFromDir(sourceDir);

  if (!song || song.audio.length === 0 || !song.drumDifficulties?.length) {
    throw new Error('Prepared song failed the scan-chart drum gate');
  }

  const { chartPath, audioPaths } = preparedFiles(sourceDir, song);

  return {
    identity: {
      title: source.title,
      artists: [...source.artists],
      durationSeconds: source.durationSeconds,
    },
    audio: {
      source: 'local-user-attested',
      sha256: hashFiles(audioPaths),
    },
    chart: {
      source: 'local-auto-chart',
      id: chartId,
      sha256: hashFiles([chartPath]),
      reviewed: true,
    },
    scan: {
      passed: true,
      format: song.format,
      drumDifficulties: [...song.drumDifficulties],
    },
    launch: {
      passed: true,
      mode: 'headless-load',
      verifiedAt,
    },
  };
}

export function validatePlayabilityEvidence(
  sourceDir: string,
  evidence: PlayabilityEvidence,
): void {
  const blockers = playabilityBlockers(evidence);

  if (blockers.length > 0) {
    throw new Error(`Song is missing playable proof: ${blockers.join(', ')}`);
  }

  const song = buildSongFromDir(sourceDir);
  const source = song && parseLibrarySourceProvenance(song);

  if (!song || !source || !source.durationSeconds) {
    throw new Error('Source-linked song has no complete identity provenance');
  }

  if (!exactIdentity(source, evidence)) {
    throw new Error('Playable proof does not match the source row identity');
  }

  const { chartPath, audioPaths } = preparedFiles(sourceDir, song);

  if (evidence.audio.sha256 !== hashFiles(audioPaths)) {
    throw new Error(
      'Playable proof audio hash does not match the imported files',
    );
  }

  if (evidence.chart.sha256 !== hashFiles([chartPath])) {
    throw new Error(
      'Playable proof chart hash does not match the imported files',
    );
  }

  if (
    evidence.scan.format !== song.format ||
    evidence.scan.drumDifficulties.join(',') !==
      (song.drumDifficulties ?? []).join(',')
  ) {
    throw new Error(
      'Playable proof scan-chart result does not match the imported files',
    );
  }
}

export function persistPlayabilityEvidence(
  sourceDir: string,
  evidence: PlayabilityEvidence,
): void {
  const iniPath = path.join(sourceDir, 'song.ini');
  const encoded = Buffer.from(JSON.stringify(evidence)).toString('base64url');
  const field = `sk_playability = ${encoded}`;
  const original = fs.readFileSync(iniPath, 'utf8');
  const next = /^(\s*sk_playability\s*=\s*).*$/im.test(original)
    ? original.replace(/^(\s*sk_playability\s*=\s*).*$/im, `$1${encoded}`)
    : /^\s*\[song\]\s*$/im.test(original)
    ? original.replace(
        /^\s*\[song\]\s*$/im,
        (section) => `${section}\n${field}`,
      )
    : `${original.trimEnd()}\n${field}\n`;

  fs.writeFileSync(iniPath, next);
}

export function isSourceLinkedSong(song: SongData): boolean {
  return (
    song.sk_source_provider !== undefined ||
    song.sk_source_track_id !== undefined
  );
}

export function validateSourceSongForLaunch(song: SongData): void {
  if (!isSourceLinkedSong(song)) {
    return;
  }

  if (!isPlayableEvidence(song.playability)) {
    throw new Error(
      'Song is not playable until identity, lawful audio, chart review, scan-chart, and launch proof are complete',
    );
  }

  validatePlayabilityEvidence(song.dir, song.playability);
}

export function sourceSongIsPlayable(song: SongData): boolean {
  return !isSourceLinkedSong(song) || isPlayableEvidence(song.playability);
}
