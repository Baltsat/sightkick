import { describe, expect, it } from 'vitest';
import {
  fitKitZone,
  homeKitZoneFillDelta,
  HOME_KIT_ZONE_MAP,
  type KitZone,
} from './kit-zone-map';

describe('HOME_KIT_ZONE_MAP', () => {
  it('keeps a calibrated ellipse for every playable surface', () => {
    expect(Object.keys(HOME_KIT_ZONE_MAP.zones).sort()).toEqual([
      'crash',
      'hihat',
      'kick',
      'ride',
      'snare',
      'tom1',
      'tom2',
      'tom3',
    ]);

    Object.values(HOME_KIT_ZONE_MAP.zones).forEach((zone) => {
      expect(zone.center.x).toBeGreaterThan(0);
      expect(zone.center.x).toBeLessThan(1);
      expect(zone.center.y).toBeGreaterThan(0);
      expect(zone.center.y).toBeLessThan(1);
      expect(zone.radii.x).toBeGreaterThan(0);
      expect(zone.radii.y).toBeGreaterThan(0);
      expect(zone.radii.x).not.toBe(zone.radii.y);
    });
  });

  it('keeps source coordinates aligned when cover crops a wider stage', () => {
    const zone: KitZone = {
      center: { x: 0.5, y: 0.5 },
      radii: { x: 0.1, y: 0.1 },
      rotation: 0,
      depth: 1,
    };

    expect(
      fitKitZone(zone, HOME_KIT_ZONE_MAP.image, { width: 1600, height: 800 }),
    ).toMatchObject({
      left: '50.000%',
      top: '50.000%',
      width: '20.000%',
      height: '25.019%',
      transform: 'translate(-50%, -50%) rotate(0deg)',
    });
  });

  it('keeps every fill visibly distinct from its own photographic surface', () => {
    Object.keys(HOME_KIT_ZONE_MAP.zones).forEach((element) => {
      expect(
        homeKitZoneFillDelta(element as keyof typeof HOME_KIT_ZONE_MAP.zones),
      ).toBeGreaterThan(35);
    });
  });
});
