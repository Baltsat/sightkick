import type { PlatformCapabilities } from '../types';

export const webCapabilities: PlatformCapabilities = {
  lessonLibrary: true,
  indexedDbImports: true,
  webMidi: true,
  // The public Pages deployment intentionally has no privileged transcriber
  // credentials. Do not advertise chart creation until a live upstream is
  // configured and proven; the desktop app retains its local charter.
  youtubeImport: false,
  onlineSongDownloads: false,
  localFolderImport: false,
  localAudioImport: false,
  stemSplit: false,
  octave: false,
  myMusic: false,
  appUpdates: false,
  openSongDirectory: false,
};
