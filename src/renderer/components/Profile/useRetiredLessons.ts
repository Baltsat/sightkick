import { useEffect, useState } from 'react';
import {
  IpcRetiredLessonsResponse,
  RetiredLessonEvidence,
} from '../../../types';

export function useRetiredLessons(): RetiredLessonEvidence[] {
  const [lessons, setLessons] = useState<RetiredLessonEvidence[]>([]);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('load-retired-lessons');

    return window.electron.ipcRenderer.once<
      IpcRetiredLessonsResponse | { error: string }
    >('load-retired-lessons', (reply) => {
      if (!('error' in reply)) {
        setLessons(reply.lessons);
      }
    });
  }, []);

  return lessons;
}
