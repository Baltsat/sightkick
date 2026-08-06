import { useMemo } from 'react';
import { Song } from '../../../types';
import { computeLessonProgress, LessonProgress } from './helpers';

export function useLessons(songList: Song[]): LessonProgress {
  return useMemo(() => computeLessonProgress(songList), [songList]);
}
