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
  source: 'explicit' | 'kit-lanes' | 'unavailable';
  legend: string;
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
 * Snare starts, and Crash backs out. Nothing is written to InputContext, so
 * the pads retain their musical meaning everywhere else in the app.
 */
export function resolveJourneyControls(
  controlMapping: ControlMapping,
  inputMapping: InputMapping,
): JourneyControls {
  if (hasAssignedControl(controlMapping, JOURNEY_CONTROL_KEYS)) {
    return {
      mapping: controlMapping,
      source: 'explicit',
      legend: explicitLegend(controlMapping),
    };
  }

  const claimed = new Set<string>();
  const claim = (controlIds: string[] | undefined): string[] =>
    (controlIds ?? []).filter((controlId) => {
      if (claimed.has(controlId)) {
        return false;
      }

      claimed.add(controlId);

      return true;
    });
  const mapping: ControlMapping = {
    up: claim(inputMapping.tom1),
    down: claim(inputMapping.tom2),
    confirm: claim(inputMapping.snare),
    back: claim(inputMapping.crash),
  };

  if (!hasAssignedControl(mapping, JOURNEY_CONTROL_KEYS)) {
    return {
      mapping,
      source: 'unavailable',
      legend: 'Set Journey controls in Configure input',
    };
  }

  const parts: string[] = [];

  if ((mapping.up?.length ?? 0) > 0 && (mapping.down?.length ?? 0) > 0) {
    parts.push('Tom 1 / Tom 2 select');
  } else if ((mapping.up?.length ?? 0) > 0) {
    parts.push('Tom 1 selects previous');
  } else if ((mapping.down?.length ?? 0) > 0) {
    parts.push('Tom 2 selects next');
  }

  if ((mapping.confirm?.length ?? 0) > 0) {
    parts.push('Snare starts');
  }

  if ((mapping.back?.length ?? 0) > 0) {
    parts.push('Crash backs');
  }

  return {
    mapping,
    source: 'kit-lanes',
    legend: parts.join(' · '),
  };
}
