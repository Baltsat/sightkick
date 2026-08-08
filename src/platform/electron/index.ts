import type { PlatformAdapter } from '../types';

export function electronPlatform(): PlatformAdapter {
  return {
    kind: 'electron',
    capabilities: {
      lessonLibrary: true,
      indexedDbImports: false,
      webMidi: false,
      youtubeImport: true,
      localFolderImport: true,
      localAudioImport: true,
      stemSplit: true,
      octave: true,
      myMusic: true,
      appUpdates: true,
      openSongDirectory: true,
    },
    ipcRenderer: window.electron.ipcRenderer,
  };
}
