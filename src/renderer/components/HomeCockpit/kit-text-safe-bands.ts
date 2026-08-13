import type { KitZone, KitZoneMap } from './kit-zone-map';

export interface SafeBand {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface KitTextSafeBands {
  /**
   * Full-width strip from the studio's top edge down to the highest point
   * any strike zone reaches at this container size (minus `marginPx`). The
   * "window wall" the 2026-08-13 critique named - room for the eyebrow and
   * the hero title, never a cymbal.
   */
  top: SafeBand;
  /**
   * Full-width strip from the lowest point any strike zone reaches down to
   * the studio's bottom edge (minus `marginPx`). The "floor, rug" - room
   * for the primary action and the payoff shelf.
   */
  bottom: SafeBand;
}

const DEFAULT_MARGIN_PX = 12;

function ellipseVerticalHalfExtent(zone: KitZone): number {
  // The vertical half-height of an ellipse (radii rx, ry) rotated by
  // `rotation` degrees is sqrt((rx*sinθ)² + (ry*cosθ)²) - the standard
  // rotated-bounding-box formula. Every rotation in HOME_KIT_ZONE_MAP is
  // small (a few degrees, matching the photograph's real drum tilt), so
  // this stays very close to `ry`, but computing it properly (rather than
  // assuming rotation is negligible, or over-estimating with
  // `max(rx, ry)`) keeps the band honest if a future zone is calibrated
  // with a larger rotation.
  const radians = (zone.rotation * Math.PI) / 180;

  return Math.sqrt(
    (zone.radii.x * Math.sin(radians)) ** 2 +
      (zone.radii.y * Math.cos(radians)) ** 2,
  );
}

/**
 * Derives the two horizontal bands of the kit photograph that no strike
 * zone reaches into, at the given rendered studio size. This mirrors
 * `fitKitZone`'s own cover/crop projection (same scale, same vertical
 * crop) so a band and a pad always agree about where the photo actually
 * sits - the whole point is that this is computed from
 * `HOME_KIT_ZONE_MAP`, not a guessed column width, so it keeps holding if
 * the zone map or the hero photo's aspect ratio ever changes (the
 * 2026-08-13 critique's root-cause finding: "the title/manifest column
 * and the kit photo are not laid out with any awareness of where the
 * eight hotspots actually sit").
 */
export function computeKitTextSafeBands(
  zoneMap: KitZoneMap,
  container: { width: number; height: number },
  marginPx: number = DEFAULT_MARGIN_PX,
): KitTextSafeBands {
  if (container.width <= 0 || container.height <= 0) {
    const empty: SafeBand = { top: 0, left: 0, width: 0, height: 0 };

    return { top: empty, bottom: empty };
  }

  const scale = Math.max(
    container.width / zoneMap.image.width,
    container.height / zoneMap.image.height,
  );
  const renderedHeight = zoneMap.image.height * scale;
  const cropY = (renderedHeight - container.height) / 2;
  let topEdge = container.height;
  let bottomEdge = 0;

  Object.values(zoneMap.zones).forEach((zone) => {
    const halfHeight = ellipseVerticalHalfExtent(zone);
    const top = (zone.center.y - halfHeight) * renderedHeight - cropY;
    const bottom = (zone.center.y + halfHeight) * renderedHeight - cropY;

    topEdge = Math.min(topEdge, top);
    bottomEdge = Math.max(bottomEdge, bottom);
  });

  const topHeight = Math.min(container.height, Math.max(0, topEdge - marginPx));
  const bottomTop = Math.max(
    0,
    Math.min(container.height, bottomEdge + marginPx),
  );
  const bottomHeight = Math.max(0, container.height - bottomTop);

  return {
    top: { top: 0, left: 0, width: container.width, height: topHeight },
    bottom: {
      top: bottomTop,
      left: 0,
      width: container.width,
      height: bottomHeight,
    },
  };
}
