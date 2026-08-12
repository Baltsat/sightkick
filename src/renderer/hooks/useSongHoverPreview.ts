import { useCallback, useEffect, useState } from 'react';
import { Difficulty } from 'scan-chart';
import { Song } from '../../types';
import {
  SongHoverPreviewController,
  SongHoverPreviewState,
} from '../services/song-hover-preview';

export function useSongHoverPreview(enabled: boolean, difficulty: Difficulty) {
  const [preview, setPreview] = useState<SongHoverPreviewState>();
  const [controller] = useState(
    () =>
      new SongHoverPreviewController({
        onChange: setPreview,
      }),
  );

  useEffect(() => {
    controller.setEnabled(enabled);
  }, [controller, enabled]);

  useEffect(() => () => controller.dispose(), [controller]);

  const startPreview = useCallback(
    (song: Song) => controller.hover(song, difficulty),
    [controller, difficulty],
  );
  const stopPreview = useCallback(
    (songId: string) => controller.leave(songId),
    [controller],
  );

  return { preview, startPreview, stopPreview };
}
