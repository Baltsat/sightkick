import { createHash } from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseMidi, writeMidi } from 'midi-file';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATION = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'resources/open-groove-midi/curation.json'),
    'utf8',
  ),
);
const MAPPED_NOTES = new Map([
  [36, { lane: 96 }],
  [37, { lane: 97 }],
  [38, { lane: 97 }],
  [40, { lane: 97 }],
  [22, { lane: 98 }],
  [26, { lane: 98 }],
  [42, { lane: 98 }],
  [44, { lane: 98 }],
  [46, { lane: 98 }],
  [48, { lane: 98, marker: 110 }],
  [50, { lane: 98, marker: 110 }],
  [45, { lane: 99, marker: 111 }],
  [47, { lane: 99, marker: 111 }],
  [51, { lane: 99 }],
  [53, { lane: 99 }],
  [59, { lane: 99 }],
  [43, { lane: 100, marker: 112 }],
  [49, { lane: 100 }],
  [52, { lane: 100 }],
  [55, { lane: 100 }],
  [57, { lane: 100 }],
  [58, { lane: 100, marker: 112 }],
]);

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];

    if (key.startsWith('--')) {
      args.set(key.slice(2), argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function csvRows(sourceRoot) {
  const [header, ...lines] = fs
    .readFileSync(path.join(sourceRoot, 'info.csv'), 'utf8')
    .trim()
    .split(/\r?\n/);
  const columns = header.split(',');

  return lines.map((line) =>
    Object.fromEntries(
      columns.map((column, index) => [column, line.split(',')[index]]),
    ),
  );
}

function sourceHits(filePath) {
  const midi = parseMidi(fs.readFileSync(filePath));
  let tick = 0;
  let total = 0;
  const hits = [];

  for (const event of midi.tracks.flat()) {
    tick += event.deltaTime;

    if (event.type !== 'noteOn' || event.velocity === 0) {
      continue;
    }

    total += 1;

    const mapped = MAPPED_NOTES.get(event.noteNumber);

    if (mapped) {
      hits.push({ tick, velocity: event.velocity, ...mapped });
    }
  }

  return {
    ticksPerBeat: midi.header.ticksPerBeat ?? 480,
    hits,
    mappedHitRatio: total === 0 ? 0 : hits.length / total,
  };
}

function primaryStyle(row) {
  return row.style.split('/')[0];
}

function qualityRow(sourceRoot, row) {
  const parsed = sourceHits(path.join(sourceRoot, row.midi_filename));
  const bpm = Number(row.bpm);
  const [minimumBpm, maximumBpm] = CURATION.selection.tempoBpm;
  const ticksPerBar = parsed.ticksPerBeat * 4;
  const requiredBeatSeconds =
    (CURATION.selection.beats.minimumBars * ticksPerBar * 60) /
    (parsed.ticksPerBeat * bpm);

  return {
    ...row,
    bpm,
    stylePrimary: primaryStyle(row),
    parsed,
    eligible:
      row.time_signature === CURATION.selection.timeSignature &&
      bpm >= minimumBpm &&
      bpm <= maximumBpm &&
      parsed.mappedHitRatio === 1 &&
      parsed.hits.length > 0 &&
      (row.beat_type === 'beat'
        ? Number(row.duration) >= requiredBeatSeconds
        : Number(row.duration) >= CURATION.selection.fills.minimumSeconds),
  };
}

function roundRobin(rows, count) {
  const grouped = new Map();

  for (const row of rows.sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const group = grouped.get(row.stylePrimary) ?? [];

    group.push(row);
    grouped.set(row.stylePrimary, group);
  }

  const selected = [];

  for (let index = 0; selected.length < count; index += 1) {
    let added = false;

    for (const style of [...grouped.keys()].sort()) {
      const candidate = grouped.get(style)?.[index];

      if (candidate) {
        selected.push(candidate);
        added = true;
      }

      if (selected.length === count) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  if (selected.length !== count) {
    throw new Error(
      `Curation found ${selected.length} items, expected ${count}.`,
    );
  }

  return selected;
}

export function selectCuratedRows(sourceRoot) {
  const rows = csvRows(sourceRoot).map((row) => qualityRow(sourceRoot, row));
  const beats = roundRobin(
    rows.filter((row) => row.eligible && row.beat_type === 'beat'),
    CURATION.selection.beats.count,
  );
  const fills = roundRobin(
    rows.filter((row) => row.eligible && row.beat_type === 'fill'),
    CURATION.selection.fills.count,
  );

  return {
    total: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    beats,
    fills,
  };
}

function eventsAtTicks(events) {
  let previous = 0;

  return events
    .sort((left, right) => left.tick - right.tick || left.order - right.order)
    .map(({ tick, ...event }) => {
      const deltaTime = tick - previous;

      previous = tick;

      return { deltaTime, ...event };
    });
}

export function chartMidi(row) {
  const ticksPerBeat = row.parsed.ticksPerBeat;
  const ticksPerBar = ticksPerBeat * 4;
  const firstTick = row.parsed.hits[0].tick;
  const targetTicks = CURATION.selection.practiceBars * ticksPerBar;
  const sourceLength = Math.max(
    1,
    row.parsed.hits[row.parsed.hits.length - 1].tick - firstTick + 1,
  );
  const repeats =
    row.beat_type === 'fill' ? Math.ceil(targetTicks / sourceLength) : 1;
  const rawHits = row.parsed.hits.flatMap((hit) =>
    Array.from({ length: repeats }, (_, repeat) => ({
      ...hit,
      tick: hit.tick - firstTick + repeat * sourceLength,
    })),
  );
  const hits = rawHits.filter((hit) => hit.tick < targetTicks);
  const drums = [
    { tick: 0, order: 0, meta: true, type: 'trackName', text: 'PART DRUMS' },
    {
      tick: 0,
      order: 1,
      meta: true,
      type: 'text',
      text: '[ENABLE_CHART_DYNAMICS]',
    },
    ...hits.flatMap((hit) => [
      {
        tick: hit.tick,
        order: 2,
        channel: 9,
        type: 'noteOn',
        noteNumber: hit.lane,
        velocity: hit.velocity,
      },
      {
        tick: hit.tick + 10,
        order: 0,
        channel: 9,
        type: 'noteOff',
        noteNumber: hit.lane,
        velocity: 0,
      },
      ...(hit.marker
        ? [
            {
              tick: hit.tick,
              order: 2,
              channel: 9,
              type: 'noteOn',
              noteNumber: hit.marker,
              velocity: 100,
            },
            {
              tick: hit.tick + 10,
              order: 0,
              channel: 9,
              type: 'noteOff',
              noteNumber: hit.marker,
              velocity: 0,
            },
          ]
        : []),
    ]),
    { tick: targetTicks, order: 3, meta: true, type: 'endOfTrack' },
  ];

  return {
    buffer: Buffer.from(
      writeMidi({
        header: { format: 1, numTracks: 2, ticksPerBeat },
        tracks: [
          eventsAtTicks([
            {
              tick: 0,
              order: 0,
              meta: true,
              type: 'trackName',
              text: 'Tempo Track',
            },
            {
              tick: 0,
              order: 1,
              meta: true,
              type: 'timeSignature',
              numerator: 4,
              denominator: 4,
              metronome: 24,
              thirtyseconds: 8,
            },
            {
              tick: 0,
              order: 2,
              meta: true,
              type: 'setTempo',
              microsecondsPerBeat: Math.round(60_000_000 / row.bpm),
            },
            { tick: targetTicks, order: 3, meta: true, type: 'endOfTrack' },
          ]),
          eventsAtTicks(drums),
        ],
      }),
    ),
    targetTicks,
    ticksPerBeat,
    hits,
    repeats,
  };
}

function wavBuffer(durationSeconds, bpm) {
  const rate = 22_050;
  const samples = new Int16Array(Math.ceil(durationSeconds * rate));
  const beatSamples = (60 / bpm) * rate;

  for (let beat = 0; beat * beatSamples < samples.length; beat += 1) {
    const start = Math.round(beat * beatSamples);
    const length = Math.min(Math.round(rate * 0.018), samples.length - start);
    const amplitude = beat % 4 === 0 ? 0.8 : 0.5;
    const frequency = beat % 4 === 0 ? 2200 : 1500;

    for (let index = 0; index < length; index += 1) {
      const fade = 1 - index / length;

      samples[start + index] = Math.round(
        32767 *
          amplitude *
          fade *
          Math.sin((2 * Math.PI * frequency * index) / rate),
      );
    }
  }

  const data = Buffer.from(samples.buffer);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

function styleDemand(row) {
  if (row.beat_type === 'fill') {
    return ['kit.fill_return', 'coord.hand_to_foot'];
  }

  if (row.stylePrimary === 'jazz') {
    return ['feel.jazz_ride', 'pulse.triplet'];
  }

  if (row.style.includes('shuffle')) {
    return ['feel.shuffle', 'pulse.triplet'];
  }

  return row.parsed.hits.filter(({ lane }) => lane === 98).length >=
    row.parsed.hits.length * 0.35
    ? ['music.groove_8th', 'coord.hand_to_foot']
    : ['music.groove_16th', 'coord.hand_to_foot'];
}

export function manifestFor(row, chart) {
  const [primary, secondary] = row.style.split('/');
  const lanes = [
    ...new Set(
      chart.hits.map(
        ({ lane }) => ({ 96: 'K', 97: 'S', 98: 'H', 99: 'R', 100: 'C' })[lane],
      ),
    ),
  ].join(',');
  const [first, second] = styleDemand(row);
  const hasAccent = chart.hits.some(({ velocity }) => velocity >= 110);
  const demands = [
    {
      skill_id: first,
      weight: hasAccent ? 0.45 : 0.55,
      target_bpm: row.bpm,
      context: `meter=4/4;subdivision=${
        first.includes('triplet')
          ? 'triplet'
          : first.includes('16th')
          ? 'sixteenth'
          : 'eighth'
      };lanes=${lanes};limbs=joint;phrase=${row.beat_type}`,
    },
    {
      skill_id: second,
      weight: hasAccent ? 0.35 : 0.45,
      target_bpm: row.bpm,
      context: `meter=4/4;subdivision=eighth;lanes=${lanes};limbs=joint;phrase=${row.beat_type}`,
    },
    ...(hasAccent
      ? [
          {
            skill_id: 'dynamics.accent',
            weight: 0.2,
            target_bpm: row.bpm,
            context: `meter=4/4;subdivision=eighth;lanes=${lanes};limbs=joint;phrase=${row.beat_type}`,
          },
        ]
      : []),
  ];

  return {
    item_id: localId(row),
    source: 'chart_analysis',
    source_revision: `gmd-v1.0.0:${row.id}:converted-v1`,
    chart_revision: createHash('sha256').update(chart.buffer).digest('hex'),
    demands,
    context_signature: `meter=4/4;style=${primary};variant=${
      secondary ?? 'plain'
    };lanes=${lanes};phrase=${row.beat_type}`,
    assessment_confidence: 0.72,
    chart_total_notes: chart.hits.length,
  };
}

function slug(row) {
  return `gmd-${row.id
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '')}`;
}

function localId(row) {
  return `local:groove-midi:${slug(row)}`;
}

function songIni(row, chart, pedagogy) {
  const title = `${row.stylePrimary} ${row.beat_type} · ${row.bpm} BPM`;
  const duration = (chart.targetTicks / chart.ticksPerBeat) * (60 / row.bpm);

  return `[Song]\nname = ${title}\nartist = Groove MIDI Dataset · Google LLC · CC BY 4.0\nalbum = Human drummer performance · 8-bar practice loop\ngenre = ${
    row.style
  }\nyear = 2019\ncharter = Converted for Drumroll from GMD MIDI\npro_drums = True\ndiff_drums = 6\npreview_start_time = 0\nsong_length = ${duration.toFixed(
    3,
  )}\nsk_source_kind = groove-midi-dataset\nsk_source_id = ${
    row.id
  }\nsk_source_url = ${
    CURATION.dataset.sourceUrl
  }\nsk_source_license = CC BY 4.0\nsk_source_license_url = ${
    CURATION.dataset.licenseUrl
  }\nsk_source_attribution = Groove MIDI Dataset by Google LLC\nsk_source_changes = Roland TD-11 mapping to PART DRUMS, 8-bar crop${
    chart.repeats > 1 ? `, fill repeated ${chart.repeats} times` : ''
  }, generated click track\nsk_pedagogy_manifest = ${Buffer.from(
    JSON.stringify(pedagogy),
  ).toString('base64url')}\n`;
}

function writeClick(target, row, chart) {
  const wavPath = path.join(target, 'click.wav');
  const duration = (chart.targetTicks / chart.ticksPerBeat) * (60 / row.bpm);

  fs.writeFileSync(wavPath, wavBuffer(duration, row.bpm));

  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    wavPath,
    '-ac',
    '1',
    '-ar',
    '48000',
    '-map_metadata',
    '-1',
    '-c:a',
    'opus',
    '-strict',
    '-2',
    '-b:a',
    '48k',
    path.join(target, 'song.opus'),
  ]);

  fs.rmSync(wavPath, { force: true });

  if (ffmpeg.status !== 0) {
    throw new Error(
      `ffmpeg could not create the click track for ${row.id}: ${ffmpeg.stderr
        .toString()
        .trim()}`,
    );
  }
}

function downloadSource(downloadDir) {
  const archive = path.join(downloadDir, 'groove-v1.0.0-midionly.zip');
  const sourceRoot = path.join(downloadDir, 'groove');

  fs.mkdirSync(downloadDir, { recursive: true });

  if (!fs.existsSync(sourceRoot)) {
    if (!fs.existsSync(archive)) {
      execFileSync(
        'curl',
        [
          '--fail',
          '--location',
          '--retry',
          '3',
          '--output',
          archive,
          CURATION.dataset.midiOnlyUrl,
        ],
        { stdio: 'inherit' },
      );
    }

    const checksum = createHash('sha256')
      .update(fs.readFileSync(archive))
      .digest('hex');

    if (checksum !== CURATION.dataset.midiOnlySha256) {
      throw new Error(`GMD archive SHA-256 mismatch: ${checksum}.`);
    }

    execFileSync('unzip', ['-q', archive, '-d', downloadDir]);
  }

  return sourceRoot;
}

export function importGrooveMidiDataset({ sourceRoot, outputRoot }) {
  const curation = selectCuratedRows(sourceRoot);
  const target = `${outputRoot}.installing`;

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const catalogue = [];
  const lessons = [...curation.beats, ...curation.fills].map((row) => {
    const folder = slug(row);
    const songDir = path.join(target, folder);
    const chart = chartMidi(row);
    const pedagogy = manifestFor(row, chart);

    fs.mkdirSync(songDir);
    fs.writeFileSync(path.join(songDir, 'notes.mid'), chart.buffer);
    fs.writeFileSync(
      path.join(songDir, 'song.ini'),
      songIni(row, chart, pedagogy),
    );
    fs.writeFileSync(
      path.join(songDir, 'sticking.json'),
      JSON.stringify({ version: 1, source: 'unavailable', bars: [] }),
    );
    writeClick(songDir, row, chart);
    catalogue.push({
      id: localId(row),
      sourceId: row.id,
      style: row.style,
      bpm: row.bpm,
      beatType: row.beat_type,
      attribution: CURATION.dataset,
      changes: `Roland TD-11 mapping to PART DRUMS, 8-bar crop${
        chart.repeats > 1 ? `, fill repeated ${chart.repeats} times` : ''
      }, generated click track`,
      pedagogy,
    });

    return {
      song: { id: localId(row), drumDifficulties: ['expert'] },
      sticking: `${folder}/sticking.json`,
    };
  });

  fs.writeFileSync(
    path.join(target, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        lessonCount: lessons.length,
        pack: {
          id: 'groove-midi',
          title: 'Groove MIDI Dataset · Google LLC · CC BY 4.0',
        },
        lessons,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(target, 'catalogue.json'),
    JSON.stringify(
      {
        version: 1,
        curation: {
          total: curation.total,
          eligible: curation.eligible,
          selected: catalogue.length,
          beats: curation.beats.length,
          fills: curation.fills.length,
        },
        attribution: CURATION.dataset,
        items: catalogue,
      },
      null,
      2,
    ),
  );
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.renameSync(target, outputRoot);

  return { outputRoot, ...curation, catalogue };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = args.get('out');

  if (!outputRoot) {
    throw new Error(
      'Usage: yarn import:groove-midi -- --out <Local Lesson Packs/Groove MIDI Dataset> [--source <groove directory>] [--download-dir <directory>]',
    );
  }

  const sourceRoot =
    args.get('source') ??
    downloadSource(
      args.get('download-dir') ??
        path.join(os.tmpdir(), 'drumroll-groove-midi-v1'),
    );
  const result = importGrooveMidiDataset({ sourceRoot, outputRoot });

  process.stdout.write(
    `${JSON.stringify(
      {
        outputRoot: result.outputRoot,
        sourceCount: result.total,
        eligibleCount: result.eligible,
        selectedCount: result.catalogue.length,
        beats: result.beats.length,
        fills: result.fills.length,
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
