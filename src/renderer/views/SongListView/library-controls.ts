import { ControlMapping, InputMapping } from '../../../types';
import { controlLabel } from '../../input';

const LIBRARY_CONTROL_KEYS: (keyof ControlMapping)[] = [
  'up',
  'down',
  'confirm',
  'back',
  'difficulty',
  'sort',
];

export interface LibraryControls {
  mapping: ControlMapping;
  source: 'explicit' | 'kit-lanes' | 'mixed' | 'unavailable';
  legend: string;
  kitActions: (keyof ControlMapping)[];
}

function hasAssignedControl(
  mapping: ControlMapping,
  keys: (keyof ControlMapping)[],
): boolean {
  return keys.some((key) => (mapping[key]?.length ?? 0) > 0);
}

function friendlyControlLabel(controlId: string): string {
  const label = controlLabel(controlId);

  return (
    {
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      Enter: 'Enter',
      Escape: 'Esc',
      Space: 'Space',
    }[label] ?? label
  );
}

function assignedLabels(
  mapping: ControlMapping,
  keys: (keyof ControlMapping)[],
): string[] {
  return [
    ...new Set(
      keys.flatMap((key) => mapping[key] ?? []).map(friendlyControlLabel),
    ),
  ];
}

function explicitLegend(mapping: ControlMapping): string {
  const parts: string[] = [];
  const move = assignedLabels(mapping, ['up', 'down']);
  const confirm = assignedLabels(mapping, ['confirm']);
  const back = assignedLabels(mapping, ['back']);
  const difficulty = assignedLabels(mapping, ['difficulty']);
  const sort = assignedLabels(mapping, ['sort']);

  if (move.length > 0) {
    parts.push(`${move.join(' / ')} move`);
  }

  if (confirm.length > 0) {
    parts.push(`${confirm.join(' / ')} chooses`);
  }

  if (difficulty.length > 0) {
    parts.push(`${difficulty.join(' / ')} filters difficulty`);
  }

  if (sort.length > 0) {
    parts.push(`${sort.join(' / ')} sorts`);
  }

  if (back.length > 0) {
    parts.push(`${back.join(' / ')} backs`);
  }

  return parts.join(' · ');
}

function kitLegend(
  mapping: ControlMapping,
  kitActions: (keyof ControlMapping)[],
): string {
  const parts: string[] = [];
  const has = (action: keyof ControlMapping) => kitActions.includes(action);

  if (has('up') && has('down')) {
    parts.push('Tom 1 / Tom 2 move');
  } else if (has('up')) {
    parts.push('Tom 1 moves up');
  } else if (has('down')) {
    parts.push('Tom 2 moves down');
  }

  if (has('confirm') && (mapping.confirm?.length ?? 0) > 0) {
    parts.push('Snare chooses');
  }

  if (has('difficulty') && (mapping.difficulty?.length ?? 0) > 0) {
    parts.push('Hi-hat filters difficulty');
  }

  if (has('sort') && (mapping.sort?.length ?? 0) > 0) {
    parts.push('Tom 3 opens sort');
  }

  if (has('back') && (mapping.back?.length ?? 0) > 0) {
    parts.push('Crash backs');
  }

  return parts.join(' · ');
}

export function resolveLibraryControls(
  controlMapping: ControlMapping,
  inputMapping: InputMapping,
): LibraryControls {
  const explicit = hasAssignedControl(controlMapping, LIBRARY_CONTROL_KEYS);
  const claimed = new Set(
    Object.values(controlMapping).flatMap((controlIds) => controlIds ?? []),
  );
  const kitActions: (keyof ControlMapping)[] = [];
  const fill = (
    action: keyof ControlMapping,
    controlIds: string[] | undefined,
  ): string[] => {
    const assigned = controlMapping[action] ?? [];
    const fallback = (controlIds ?? []).filter((controlId) => {
      if (claimed.has(controlId)) {
        return false;
      }

      claimed.add(controlId);

      return true;
    });

    if (fallback.length > 0) {
      kitActions.push(action);
    }

    // Explicit keyboard/pad bindings stay valid, but they must not suppress
    // the drum-lane fallback. A player who configured one shortcut months
    // ago should still be able to sit at a freshly connected kit and control
    // the full library without returning to Settings.
    return [...assigned, ...fallback];
  };
  const mapping: ControlMapping = {
    ...controlMapping,
    up: fill('up', inputMapping.tom1),
    down: fill('down', inputMapping.tom2),
    confirm: fill('confirm', inputMapping.snare),
    difficulty: fill('difficulty', inputMapping.hihat),
    sort: fill('sort', inputMapping.tom3),
    back: fill('back', inputMapping.crash),
  };

  if (!hasAssignedControl(mapping, LIBRARY_CONTROL_KEYS)) {
    return {
      mapping,
      source: 'unavailable',
      legend: 'Set library controls in Configure input',
      kitActions,
    };
  }

  const fallbackLegend = kitLegend(mapping, kitActions);

  return {
    mapping,
    source: explicit
      ? kitActions.length > 0
        ? 'mixed'
        : 'explicit'
      : 'kit-lanes',
    legend: explicit
      ? kitActions.length > 0
        ? `Explicit: ${explicitLegend(
            controlMapping,
          )} · Kit fallback: ${fallbackLegend}`
        : explicitLegend(controlMapping)
      : fallbackLegend,
    kitActions,
  };
}
