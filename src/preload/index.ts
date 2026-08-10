import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'load-song-list'
  | 'load-song'
  | 'rescan-songs'
  | 'like-song'
  | 'prevent-sleep'
  | 'resume-sleep'
  | 'check-dev'
  | 'download-song'
  | 'select-import-song'
  | 'import-song'
  | 'check-auto-chart-backends'
  | 'auto-chart-backends'
  | 'create-auto-chart'
  | 'auto-chart-update'
  | 'cancel-auto-chart'
  | 'retry-auto-chart'
  | 'discard-auto-chart-preview'
  | 'import-auto-chart'
  | 'get-auto-chart-remote-settings'
  | 'auto-chart-remote-settings'
  | 'save-test-auto-chart-remote'
  | 'auto-chart-remote-test'
  | 'search-youtube'
  | 'my-music-fetch'
  | 'load-library-candidates'
  | 'check-stem-tools'
  | 'check-stem-tools-update'
  | 'download-stem-tools'
  | 'cancel-stem-tools'
  | 'delete-stem-tools'
  | 'split-song'
  | 'cancel-split'
  | 'open-song-directory'
  | 'midi-device-list'
  | 'listen-midi'
  | 'midi-ready'
  | 'midi-error'
  | 'stop-listen-midi'
  | 'check-update'
  | 'update-status'
  | 'download-update'
  | 'install-update'
  | 'update-song'
  | 'save-practice-run'
  | 'load-practice-runs'
  | 'save-practice-attempt-checkpoint'
  | 'load-practice-attempt-checkpoints'
  | 'finalize-practice-attempt-checkpoint'
  | 'get-coach-settings'
  | 'coach-settings'
  | 'save-coach-settings'
  | 'coach-settings-saved'
  | 'get-coaching-notes'
  | 'coaching-notes'
  | 'record-practice-day'
  | 'load-practice-days'
  | 'load-all-practice-runs'
  | 'load-retired-lessons'
  | 'save-goal'
  | 'load-goals'
  | 'delete-goal'
  | 'set-primary-goal'
  | 'export-pdf';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on<T>(channel: Channels, func: (args: T) => void) {
      const subscription = (_event: IpcRendererEvent, args: T) => func(args);

      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once<T>(channel: Channels, func: (args: T) => void) {
      const subscription = (_event: IpcRendererEvent, args: T) => func(args);

      ipcRenderer.once(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
