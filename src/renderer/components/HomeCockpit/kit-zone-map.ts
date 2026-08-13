import type { KitElement } from '../../services/practice-stats';
import type { KitColorLane } from '../../services/kit-color-maturity';

export interface KitZone {
  center: { x: number; y: number };
  radii: { x: number; y: number };
  rotation: number;
  depth: number;
}

interface KitImageMap {
  width: number;
  height: number;
}

export interface KitZoneMap {
  image: KitImageMap;
  zones: Record<KitElement, KitZone>;
}

export interface KitZoneStyle {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string;
  zIndex: number;
}

export const HOME_KIT_ZONE_MAP: KitZoneMap = {
  image: { width: 1586, height: 992 },
  zones: {
    hihat: {
      center: { x: 0.244, y: 0.466 },
      radii: { x: 0.101, y: 0.048 },
      rotation: 1.8,
      depth: 2,
    },
    crash: {
      center: { x: 0.289, y: 0.255 },
      radii: { x: 0.096, y: 0.057 },
      rotation: 3.2,
      depth: 1,
    },
    tom1: {
      center: { x: 0.445, y: 0.318 },
      radii: { x: 0.064, y: 0.054 },
      rotation: -1.8,
      depth: 2,
    },
    tom2: {
      center: { x: 0.581, y: 0.319 },
      radii: { x: 0.064, y: 0.056 },
      rotation: 1.3,
      depth: 2,
    },
    ride: {
      center: { x: 0.764, y: 0.229 },
      radii: { x: 0.123, y: 0.081 },
      rotation: -1.7,
      depth: 1,
    },
    snare: {
      center: { x: 0.433, y: 0.497 },
      radii: { x: 0.085, y: 0.055 },
      rotation: -1.4,
      depth: 4,
    },
    tom3: {
      center: { x: 0.708, y: 0.55 },
      radii: { x: 0.098, y: 0.069 },
      rotation: 1.7,
      depth: 3,
    },
    kick: {
      center: { x: 0.469, y: 0.744 },
      radii: { x: 0.086, y: 0.136 },
      rotation: 0,
      depth: 1,
    },
  },
};

export const HOME_KIT_ZONE_LANES: Record<KitElement, KitColorLane> = {
  kick: 'orange',
  snare: 'red',
  hihat: 'yellow',
  tom1: 'yellow',
  ride: 'blue',
  tom2: 'blue',
  crash: 'green',
  tom3: 'green',
};

export const HOME_KIT_ZONE_FILL_OPACITY = 0.82;

type Rgb = readonly [number, number, number];

const HOME_KIT_ZONE_BACKDROPS: Record<KitElement, Rgb> = {
  hihat: [165, 123, 54],
  crash: [175, 134, 57],
  tom1: [228, 210, 174],
  tom2: [220, 213, 197],
  ride: [181, 141, 72],
  snare: [218, 206, 187],
  tom3: [218, 210, 193],
  kick: [96, 82, 65],
};
const KIT_LANE_RGB: Record<KitColorLane, Rgb> = {
  orange: [233, 93, 55],
  red: [206, 63, 84],
  yellow: [194, 122, 16],
  blue: [36, 126, 174],
  green: [22, 136, 91],
};

function blend(backdrop: Rgb, color: Rgb, opacity: number): Rgb {
  return [
    backdrop[0] * (1 - opacity) + color[0] * opacity,
    backdrop[1] * (1 - opacity) + color[1] * opacity,
    backdrop[2] * (1 - opacity) + color[2] * opacity,
  ];
}

export function homeKitZoneFillDelta(element: KitElement): number {
  const backdrop = HOME_KIT_ZONE_BACKDROPS[element];
  const signal = blend(
    [5, 6, 8],
    KIT_LANE_RGB[HOME_KIT_ZONE_LANES[element]],
    0.74,
  );
  const fill = blend(backdrop, signal, HOME_KIT_ZONE_FILL_OPACITY);

  return Math.hypot(
    fill[0] - backdrop[0],
    fill[1] - backdrop[1],
    fill[2] - backdrop[2],
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

export function fitKitZone(
  zone: KitZone,
  image: KitImageMap,
  container: { width: number; height: number },
): KitZoneStyle {
  if (container.width <= 0 || container.height <= 0) {
    return {
      left: percent(zone.center.x),
      top: percent(zone.center.y),
      width: percent(zone.radii.x * 2),
      height: percent(zone.radii.y * 2),
      transform: `translate(-50%, -50%) rotate(${zone.rotation}deg)`,
      zIndex: zone.depth,
    };
  }

  const scale = Math.max(
    container.width / image.width,
    container.height / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const cropX = (renderedWidth - container.width) / 2;
  const cropY = (renderedHeight - container.height) / 2;

  return {
    left: percent((zone.center.x * renderedWidth - cropX) / container.width),
    top: percent((zone.center.y * renderedHeight - cropY) / container.height),
    width: percent((zone.radii.x * 2 * renderedWidth) / container.width),
    height: percent((zone.radii.y * 2 * renderedHeight) / container.height),
    transform: `translate(-50%, -50%) rotate(${zone.rotation}deg)`,
    zIndex: zone.depth,
  };
}
