import type { PlatformCapabilities } from '../types';

export const webCapabilities: PlatformCapabilities = {
  lessonLibrary: true,
  indexedDbImports: true,
  webMidi: true,
  youtubeImport: true,
  localFolderImport: false,
  localAudioImport: false,
  stemSplit: false,
  octave: false,
  myMusic: false,
  appUpdates: false,
  openSongDirectory: false,
};
