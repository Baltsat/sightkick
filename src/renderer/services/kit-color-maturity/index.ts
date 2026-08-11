import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { usePersisted } from '../../hooks/usePersisted';
import { buildDrumLearningProfile } from '../learning-profile';
import type { RunSummary } from '../practice-stats';

export type KitColorOverride = 'auto' | 'full-color' | 'faded' | 'near-black';

export type KitColorLane = 'orange' | 'red' | 'yellow' | 'blue' | 'green';

export interface KitColorPresentation {
  maturity: number;
  fade: number;
  vividness: number;
  saturation: number;
}

const SETTING_KEY = 'settings.kitColorOverride';
const EVIDENCE_RUNS_FOR_FULL_MATURITY = 12;
const LANE_COLOR_VARIABLE: Record<KitColorLane, string> = {
  orange: '--color-orange',
  red: '--color-red',
  yellow: '--color-yellow',
  blue: '--color-blue',
  green: '--color-green',
};
const LANE_DARK_VARIABLE: Record<KitColorLane, string> = {
  orange: '--color-orange-dark',
  red: '--color-red-dark',
  yellow: '--color-yellow-dark',
  blue: '--color-blue-dark',
  green: '--color-green-dark',
};

let cachedRuns: readonly RunSummary[] | undefined;
let loadingRuns = false;
const runSubscribers = new Set<
  Dispatch<SetStateAction<readonly RunSummary[] | undefined>>
>();

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sharedRunHistory(): void {
  if (cachedRuns || loadingRuns || !window.electron?.ipcRenderer) {
    return;
  }

  loadingRuns = true;
  window.electron.ipcRenderer.sendMessage('load-all-practice-runs');
  window.electron.ipcRenderer.once<{ runs: RunSummary[] } | { error: string }>(
    'load-all-practice-runs',
    (reply) => {
      loadingRuns = false;

      if ('error' in reply) {
        return;
      }

      cachedRuns = reply.runs;
      runSubscribers.forEach((setRuns) => setRuns(cachedRuns));
    },
  );
}

export function kitColorMaturity(
  runs: readonly RunSummary[] | null | undefined,
): number {
  const profile = buildDrumLearningProfile(runs);

  if (profile.evidenceRuns === 0) {
    return 0;
  }

  const meanSkill =
    profile.axes.reduce((total, axis) => total + axis.score, 0) /
    profile.axes.length /
    100;
  const evidenceCoverage = Math.min(
    1,
    profile.evidenceRuns / EVIDENCE_RUNS_FOR_FULL_MATURITY,
  );

  return clamp(meanSkill * evidenceCoverage);
}

export function kitColorPresentation(
  maturity: number,
  override: KitColorOverride = 'auto',
): KitColorPresentation {
  const resolvedMaturity = clamp(maturity);
  const fade =
    override === 'full-color'
      ? 0
      : override === 'faded'
        ? 0.62
        : override === 'near-black'
          ? 1
          : clamp((resolvedMaturity - 0.1) / 0.9);

  return {
    maturity: resolvedMaturity,
    fade,
    vividness: 100 - fade * 92,
    saturation: 100 - fade * 78,
  };
}

export function kitColorProperties(
  presentation: KitColorPresentation,
): CSSProperties {
  return {
    '--kit-color-maturity': presentation.maturity.toFixed(3),
    '--kit-color-fade': presentation.fade.toFixed(3),
    '--kit-color-vividness': `${presentation.vividness.toFixed(1)}%`,
    '--kit-color-saturation': `${presentation.saturation.toFixed(1)}%`,
  } as CSSProperties;
}

export function lessonKitColorProperties(
  lane: KitColorLane,
  presentation: KitColorPresentation,
): CSSProperties {
  const color = `var(${LANE_COLOR_VARIABLE[lane]})`;
  const dark = `var(${LANE_DARK_VARIABLE[lane]})`;

  return {
    ...kitColorProperties(presentation),
    '--lesson-lane-color': `color-mix(in srgb, ${color} var(--kit-color-vividness), #050608)`,
    '--lesson-lane-dark': `color-mix(in srgb, ${dark} var(--kit-color-vividness), #050608)`,
  } as CSSProperties;
}

export function useKitColorMaturity(runs?: readonly RunSummary[]) {
  const [override, setOverride] = usePersisted<KitColorOverride>(
    SETTING_KEY,
    'auto',
  );
  const [sharedRuns, setSharedRuns] = useState<
    readonly RunSummary[] | undefined
  >(cachedRuns);

  useEffect(() => {
    if (runs) {
      return;
    }

    runSubscribers.add(setSharedRuns);
    sharedRunHistory();

    return () => {
      runSubscribers.delete(setSharedRuns);
    };
  }, [runs]);

  const maturity = useMemo(
    () => kitColorMaturity(runs ?? sharedRuns),
    [runs, sharedRuns],
  );
  const presentation = useMemo(
    () => kitColorPresentation(maturity, override),
    [maturity, override],
  );

  return {
    override,
    setOverride,
    presentation,
    properties: kitColorProperties(presentation),
  };
}
