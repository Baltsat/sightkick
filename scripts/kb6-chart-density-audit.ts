import fs from 'node:fs';
import { Difficulty, parseChartFile } from 'scan-chart';
import { ChartParser } from '../src/chart-parser/parser';

const chartPath = process.argv[2];
const difficulty = (process.argv[3] ?? 'expert') as Difficulty;

if (!chartPath) {
  throw new Error(
    'Usage: jiti scripts/kb6-chart-density-audit.ts <notes.mid> [difficulty]',
  );
}

const chart = parseChartFile(
  new Uint8Array(fs.readFileSync(chartPath)),
  chartPath.endsWith('.chart') ? 'chart' : 'mid',
  { pro_drums: true, five_lane_drums: false },
);
const track = chart.trackData.find(
  (candidate) =>
    candidate.instrument === 'drums' && candidate.difficulty === difficulty,
);

if (!track) {
  throw new Error(`No ${difficulty} drum track in ${chartPath}`);
}

const parser = new ChartParser(chart, false, difficulty);
const parsedOnsets = parser.measures.flatMap((measure) =>
  measure.notes.filter((note) => !note.isRest),
);

process.stdout.write(
  `${JSON.stringify(
    {
      chartPath,
      difficulty,
      resolution: chart.resolution,
      rawGroups: track.noteEventGroups.length,
      rawEvents: track.noteEventGroups.flat().length,
      parsedOnsets: parsedOnsets.length,
      parsedDrumSymbols: parsedOnsets.reduce(
        (sum, note) => sum + note.notes.length,
        0,
      ),
      firstRawGroups: track.noteEventGroups.slice(0, 32).map((group) => ({
        tick: group[0]?.tick,
        types: group.map((event) => event.type),
        flags: group.map((event) => event.flags),
      })),
      firstMeasures: parser.measures.slice(0, 8).map((measure, index) => ({
        index,
        startTick: measure.startTick,
        endTick: measure.endTick,
        notes: measure.notes
          .filter((note) => !note.isRest)
          .map((note) => ({ tick: note.tick, keys: note.notes })),
      })),
    },
    null,
    2,
  )}\n`,
);
