import { WheelEvent, useCallback, useEffect, useRef } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

function clampZoom(value: number) {
  return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)).toFixed(1));
}

function editableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

export function useScorePinchZoom({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (zoom: number) => void;
}) {
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const stepZoom = useCallback(
    (direction: -1 | 1) => {
      const next = clampZoom(zoomRef.current + direction * ZOOM_STEP);

      if (next !== zoomRef.current) {
        zoomRef.current = next;
        setZoom(next);
      }
    },
    [setZoom],
  );
  const onWheelCapture = useCallback(
    (event: WheelEvent<HTMLElement>) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      stepZoom(event.deltaY < 0 ? 1 : -1);
    },
    [stepZoom],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (!event.ctrlKey && !event.metaKey) ||
        editableTarget(event.target) ||
        (event.key !== '+' && event.key !== '=' && event.key !== '-')
      ) {
        return;
      }

      event.preventDefault();
      stepZoom(event.key === '-' ? -1 : 1);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepZoom]);

  return { onWheelCapture };
}
