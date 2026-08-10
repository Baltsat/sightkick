import type { ElectronHandler } from '../preload';

export interface PlatformCapabilities {
  lessonLibrary: boolean;
  indexedDbImports: boolean;
  webMidi: boolean;
  youtubeImport: boolean;
  onlineSongDownloads: boolean;
  localFolderImport: boolean;
  localAudioImport: boolean;
  stemSplit: boolean;
  octave: boolean;
  myMusic: boolean;
  appUpdates: boolean;
  openSongDirectory: boolean;
}

export interface PlatformAdapter {
  kind: 'electron' | 'web';
  capabilities: PlatformCapabilities;
  ipcRenderer: ElectronHandler['ipcRenderer'];
}

declare global {
  interface Window {
    drumrollPlatform?: Pick<PlatformAdapter, 'kind' | 'capabilities'>;
  }
}
