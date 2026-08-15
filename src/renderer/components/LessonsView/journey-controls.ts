import { ControlMapping, InputMapping } from '../../../types';
import { controlLabel } from '../../input';

const JOURNEY_CONTROL_KEYS: (keyof ControlMapping)[] = [
  'up',
  'down',
  'left',
  'right',
  'confirm',
  'back',
];

export interface JourneyControls {
  mapping: ControlMapping;
  source: 'explicit' | 'mixed' | 'kit-lanes' | 'unavailable';
  legend: string;
  kitActions: Array<'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'>;
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
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
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
  const select = assignedLabels(mapping, ['up', 'down']);
  const season = assignedLabels(mapping, ['left', 'right']);
  const confirm = assignedLabels(mapping, ['confirm']);
  const back = assignedLabels(mapping, ['back']);

  if (select.length > 0) {
    parts.push(`${select.join(' / ')} select`);
  }

  if (season.length > 0) {
    parts.push(`${season.join(' / ')} change season`);
  }

  if (confirm.length > 0) {
    parts.push(`${confirm.join(' / ')} starts`);
  }

  if (back.length > 0) {
    parts.push(`${back.join(' / ')} backs`);
  }

  return parts.join(' · ');
}

/**
 * Resolve controls for the Journey surface only. Authored control mappings
 * remain authoritative. When none of the Journey actions has an explicit
 * binding, familiar kit lanes become a local fallback: Tom 1/Tom 2 move,
 * Snare/Tom 3 change season, Crash starts, and Ride backs out. Nothing is
 * written to InputContext, so
 * the pads retain their musical meaning everywhere else in the app.
 */
export function resolveJourneyControls(
  controlMapping: ControlMapping,
  inputMapping: InputMapping,
): JourneyControls {
  const hasExplicit = hasAssignedControl(controlMapping, JOURNEY_CONTROL_KEYS);
  // Never let a local fallback steal a pad/key that the player deliberately
  // assigned anywhere in the control map. Fill only missing Journey actions.
  const claimed = new Set<string>(
    Object.values(controlMapping).flatMap((controlIds) => controlIds ?? []),
  );
  const claim = (controlIds: string[] | undefined): string[] =>
    (controlIds ?? []).filter((controlId) => {
      if (claimed.has(controlId)) {
        return false;
      }

      claimed.add(controlId);

      return true;
    });
  const fallbackMapping: ControlMapping = {
    up: (controlMapping.up?.length ?? 0) > 0 ? [] : claim(inputMapping.tom1),
    down:
      (controlMapping.down?.length ?? 0) > 0 ? [] : claim(inputMapping.tom2),
    left:
      (controlMapping.left?.length ?? 0) > 0 ? [] : claim(inputMapping.snare),
    right:
      (controlMapping.right?.length ?? 0) > 0 ? [] : claim(inputMapping.tom3),
    confirm:
      (controlMapping.confirm?.length ?? 0) > 0
        ? []
        : claim(inputMapping.crash),
    back:
      (controlMapping.back?.length ?? 0) > 0 ? [] : claim(inputMapping.ride),
  };
  const mapping: ControlMapping = {
    ...controlMapping,
    ...Object.fromEntries(
      JOURNEY_CONTROL_KEYS.map((key) => [
        key,
        [...(controlMapping[key] ?? []), ...(fallbackMapping[key] ?? [])],
      ]),
    ),
  };

  if (!hasAssignedControl(mapping, JOURNEY_CONTROL_KEYS)) {
    return {
      mapping,
      source: 'unavailable',
      legend: 'Set Journey controls in Configure input',
      kitActions: [],
    };
  }

  const parts: string[] = [];
  const kitActions: JourneyControls['kitActions'] = [];

  if (
    (fallbackMapping.up?.length ?? 0) > 0 &&
    (fallbackMapping.down?.length ?? 0) > 0
  ) {
    parts.push('Tom 1 / Tom 2 select');
  } else if ((fallbackMapping.up?.length ?? 0) > 0) {
    parts.push('Tom 1 selects previous');
  } else if ((fallbackMapping.down?.length ?? 0) > 0) {
    parts.push('Tom 2 selects next');
  }

  if ((fallbackMapping.up?.length ?? 0) > 0) {
    kitActions.push('up');
  }

  if ((fallbackMapping.down?.length ?? 0) > 0) {
    kitActions.push('down');
  }

  if ((fallbackMapping.confirm?.length ?? 0) > 0) {
    parts.push('Crash starts');
    kitActions.push('confirm');
  }

  if (
    (fallbackMapping.left?.length ?? 0) > 0 &&
    (fallbackMapping.right?.length ?? 0) > 0
  ) {
    parts.push('Snare / Tom 3 change season');
  } else if ((fallbackMapping.left?.length ?? 0) > 0) {
    parts.push('Snare selects previous season');
  } else if ((fallbackMapping.right?.length ?? 0) > 0) {
    parts.push('Tom 3 selects next season');
  }

  if ((fallbackMapping.left?.length ?? 0) > 0) {
    kitActions.push('left');
  }

  if ((fallbackMapping.right?.length ?? 0) > 0) {
    kitActions.push('right');
  }

  if ((fallbackMapping.back?.length ?? 0) > 0) {
    parts.push('Ride backs');
    kitActions.push('back');
  }

  const fallbackLegend = parts.join(' · ');
  const explicit = explicitLegend(controlMapping);

  return {
    mapping,
    source:
      kitActions.length === 0
        ? 'explicit'
        : hasExplicit
        ? 'mixed'
        : 'kit-lanes',
    legend: [explicit, fallbackLegend].filter(Boolean).join(' · '),
    kitActions: (
      ['up', 'down', 'left', 'right', 'confirm', 'back'] as const
    ).filter((action) => kitActions.includes(action)),
  };
}
