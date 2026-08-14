import { describe, expect, it } from 'vitest';
import { HOME_KIT_ZONE_MAP, type KitZoneMap } from './kit-zone-map';
import { computeKitTextSafeBands } from './kit-text-safe-bands';

/**
 * Independent re-implementation of a zone's projected bounding box - not a
 * call into `computeKitTextSafeBands` or `fitKitZone` - so this test can't
 * pass merely because both sides share one bug. Same cover/crop math
 * `fitKitZone` uses (scale to cover, centre-crop), applied to the ellipse's
 * true rotated bounding box rather than its unrotated radii.
 */
function projectZoneBox(
  zone: KitZoneMap['zones'][keyof KitZoneMap['zones']],
  image: KitZoneMap['image'],
  container: { width: number; height: number },
) {
  const scale = Math.max(
    container.width / image.width,
    container.height / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const cropX = (renderedWidth - container.width) / 2;
  const cropY = (renderedHeight - container.height) / 2;
  const radians = (zone.rotation * Math.PI) / 180;
  const halfX = Math.sqrt(
    (zone.radii.x * Math.cos(radians)) ** 2 +
      (zone.radii.y * Math.sin(radians)) ** 2,
  );
  const halfY = Math.sqrt(
    (zone.radii.x * Math.sin(radians)) ** 2 +
      (zone.radii.y * Math.cos(radians)) ** 2,
  );

  return {
    left: (zone.center.x - halfX) * renderedWidth - cropX,
    right: (zone.center.x + halfX) * renderedWidth - cropX,
    top: (zone.center.y - halfY) * renderedHeight - cropY,
    bottom: (zone.center.y + halfY) * renderedHeight - cropY,
  };
}

function rectsOverlap(
  a: { top: number; left: number; width: number; height: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;

  return (
    a.left < b.right && aRight > b.left && a.top < b.bottom && aBottom > b.top
  );
}

// The two window sizes Drumroll actually ships and captures QA against:
// `windowConfig.ts`'s default (1366x768, but the QA harness's own capture
// script narrows the wide shot to 1225 to match a since-fixed layout bug)
// and its enforced minimum (1024x700). The studio never gets the full
// window - `AppShell.css` gives the rail 13rem (208px) desktop / 4rem
// (64px) below the 1120px compact breakpoint, and the content pane has no
// padding - so the studio's own box is the window minus that rail.
const WIDE_STUDIO = { width: 1225 - 208, height: 768 };
const COMPACT_STUDIO = { width: 1024 - 64, height: 700 };

describe('computeKitTextSafeBands', () => {
  it('returns a full-width band above and below the union of every zone, at both supported studio sizes', () => {
    [WIDE_STUDIO, COMPACT_STUDIO].forEach((container) => {
      const bands = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, container);

      expect(bands.top.height).toBeGreaterThan(0);
      expect(bands.bottom.height).toBeGreaterThan(0);
      expect(bands.top.width).toBe(container.width);
      expect(bands.bottom.width).toBe(container.width);
      expect(bands.top.top).toBe(0);
      expect(bands.bottom.top + bands.bottom.height).toBeCloseTo(
        container.height,
        5,
      );

      Object.values(HOME_KIT_ZONE_MAP.zones).forEach((zone) => {
        const box = projectZoneBox(zone, HOME_KIT_ZONE_MAP.image, container);

        expect(rectsOverlap(bands.top, box)).toBe(false);
        expect(rectsOverlap(bands.bottom, box)).toBe(false);
      });
    });
  });

  it('keeps a margin between the band edge and the nearest zone, not just zero clearance', () => {
    const bands = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, WIDE_STUDIO, 12);
    let closestZoneTop = Infinity;

    Object.values(HOME_KIT_ZONE_MAP.zones).forEach((zone) => {
      const box = projectZoneBox(zone, HOME_KIT_ZONE_MAP.image, WIDE_STUDIO);

      closestZoneTop = Math.min(closestZoneTop, box.top);
    });

    expect(closestZoneTop - bands.top.height).toBeCloseTo(12, 5);
  });

  it('grows the safe bands when a smaller margin is requested and shrinks them for a larger one', () => {
    const tight = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, WIDE_STUDIO, 4);
    const loose = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, WIDE_STUDIO, 40);

    expect(tight.top.height).toBeGreaterThan(loose.top.height);
    expect(tight.bottom.height).toBeGreaterThan(loose.bottom.height);
  });

  it('stays well-formed for a zero-size (not-yet-measured) container', () => {
    const bands = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, {
      width: 0,
      height: 0,
    });

    expect(bands.top).toEqual({ top: 0, left: 0, width: 0, height: 0 });
    expect(bands.bottom).toEqual({ top: 0, left: 0, width: 0, height: 0 });
  });

  it('re-derives from whatever zone map it is given, not a cached/hardcoded layout', () => {
    // A synthetic map with one huge, dead-centre zone: the safe top/bottom
    // bands must shrink to react to it, proving the bands come from the
    // zone map argument rather than a value baked in at build time.
    const hugeCentreMap: KitZoneMap = {
      image: HOME_KIT_ZONE_MAP.image,
      zones: {
        ...HOME_KIT_ZONE_MAP.zones,
        kick: {
          center: { x: 0.5, y: 0.5 },
          radii: { x: 0.4, y: 0.48 },
          rotation: 0,
          depth: 1,
        },
      },
    };
    const defaultBands = computeKitTextSafeBands(
      HOME_KIT_ZONE_MAP,
      WIDE_STUDIO,
    );
    const changedBands = computeKitTextSafeBands(hugeCentreMap, WIDE_STUDIO);

    expect(changedBands.top.height).toBeLessThan(defaultBands.top.height);
    expect(changedBands.bottom.height).toBeLessThan(defaultBands.bottom.height);
  });
});
