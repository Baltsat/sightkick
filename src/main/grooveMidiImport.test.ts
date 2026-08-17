import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadLocalLessonPacks,
  LOCAL_LESSON_PACKS_FOLDER,
} from './lessonLibrary';

describe('Groove MIDI Dataset importer', () => {
  it.runIf(Boolean(process.env.GROOVE_MIDI_PACK))(
    'loads the imported corpus as a playable local pack',
    () => {
      const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gmd-pack-'));

      try {
        fs.cpSync(
          process.env.GROOVE_MIDI_PACK!,
          path.join(
            userDataRoot,
            LOCAL_LESSON_PACKS_FOLDER,
            'Groove MIDI Dataset',
          ),
          { recursive: true },
        );

        const loaded = loadLocalLessonPacks(userDataRoot);
        const first = Object.values(loaded.songs)[0];

        expect(loaded.rejectedPacks).toEqual([]);
        expect(Object.keys(loaded.songs)).toHaveLength(96);
        expect(first?.drumDifficulties).toEqual(['expert']);
        expect(first?.audio).toHaveLength(1);
      } finally {
        fs.rmSync(userDataRoot, { recursive: true, force: true });
      }
    },
  );
});
