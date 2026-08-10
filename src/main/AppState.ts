import path from 'path';
import { pathToFileURL } from 'url';
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  shell,
  powerSaveBlocker,
} from 'electron';
import Store from 'electron-store';
import { StorageSchema } from '../types';
import MenuBuilder from './menu';
import { ASSET_PROTOCOL, resolveAssetFilePath, resolveHtmlPath } from './util';
import { AppUpdater } from './AppUpdater';
import { loadSong } from './ipc/loadSong';
import { loadSongList } from './ipc/loadSongList';
import { downloadSong } from './ipc/downloadSong';
import { checkStemTools, checkStemToolsUpdate } from './ipc/checkStemTools';
import { downloadStemTools, cancelStemTools } from './ipc/downloadStemTools';
import { deleteStemTools } from './ipc/deleteStemTools';
import { splitSong, cancelSplit, killActiveSplit } from './ipc/splitSong';
import { listenMidi, loadMidiDeviceList, stopListenMidi } from './ipc/midi';
import { updateSong } from './ipc/updateSong';
import { rescanSongs } from './ipc/rescanSongs';
import { exportPdf } from './ipc/exportPdf';
import { importSong, selectImportSong } from './ipc/importSong';
import {
  autoChartQueue,
  cancelAutoChart,
  checkAutoChartBackends,
  createAutoChart,
  discardAutoChartPreview,
  importAutoChart,
  retryAutoChart,
} from './ipc/autoChart';
import {
  configureRemoteAutoChartStore,
  getRemoteAutoChartSettings,
  saveAndTestRemoteAutoChart,
} from './ipc/remoteAutoChart';
import { searchYoutube } from './ipc/searchYoutube';
import { fetchMyMusic } from './ipc/myMusic';
import { loadLibraryCandidates } from './ipc/loadLibraryCandidates';
import { bootstrapLessonLibrary } from './lessonLibrary';
import { applyLessonProfileMigration } from './lessonIdentityMigration';
import { savePracticeRun, loadPracticeRuns } from './ipc/practiceStats';
import {
  configureCoachStore,
  getCoachingNotes,
  getCoachSettings,
  saveCoachSettings,
} from './ipc/coach';
import {
  loadAllPracticeRuns,
  loadPracticeDays,
  recordPracticeDay,
} from './ipc/gamification';
import {
  deleteGoal,
  loadGoalsIpc,
  saveGoal,
  setPrimaryGoal,
} from './ipc/goals';
import { loadRetiredLessons } from './ipc/retiredLessons';
import { MAIN_WINDOW_SIZE } from './windowConfig';

class AppState {
  private static instance: AppState;
  private mainWindow: BrowserWindow | null = null;
  private powerSaveBlockerId: number = -1;
  readonly store = new Store();
  private libraryRoot = this.store.get('lastOpenedPath') as string | undefined;
  private lessonLibraryRoot: string | undefined;

  static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState();
    }

    return AppState.instance;
  }

  setLibraryRoot(root: string): void {
    this.libraryRoot = root;
    this.store.set('lastOpenedPath', root);
  }

  getLibraryRoots(): string[] {
    return [this.libraryRoot, this.lessonLibraryRoot].filter(
      (root, index, roots): root is string =>
        Boolean(root) && roots.indexOf(root) === index,
    );
  }

  start(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: ASSET_PROTOCOL,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
    ]);
    app.on('window-all-closed', () => {
      this.cleanup();

      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    app.on('before-quit', () => {
      this.cleanup();
    });
    app
      .whenReady()
      .then(() => {
        this.bootstrapBundledLessons();
        protocol.handle(ASSET_PROTOCOL, (request) => {
          const filePath = resolveAssetFilePath(
            request.url,
            this.getLibraryRoots(),
          );

          if (!filePath) {
            return new Response('Forbidden', { status: 403 });
          }

          return net.fetch(pathToFileURL(filePath).toString());
        });
        this.setupIpc();
        this.createWindow();
        app.on('activate', () => {
          if (!this.mainWindow) {
            this.createWindow();
          }
        });
      })
      .catch(console.log);
  }

  private setupIpc(): void {
    const isDebug =
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true';

    configureRemoteAutoChartStore(this.store);
    configureCoachStore(this.store);

    ipcMain.on('load-song', loadSong);
    ipcMain.on('load-song-list', loadSongList);
    ipcMain.on('rescan-songs', rescanSongs);
    ipcMain.on('download-song', downloadSong);
    ipcMain.on('select-import-song', selectImportSong);
    ipcMain.on('import-song', importSong);
    ipcMain.on('check-auto-chart-backends', checkAutoChartBackends);
    ipcMain.on('create-auto-chart', createAutoChart);
    ipcMain.on('cancel-auto-chart', cancelAutoChart);
    ipcMain.on('retry-auto-chart', retryAutoChart);
    ipcMain.on('discard-auto-chart-preview', discardAutoChartPreview);
    ipcMain.on('import-auto-chart', importAutoChart);
    ipcMain.on('get-auto-chart-remote-settings', getRemoteAutoChartSettings);
    ipcMain.on('save-test-auto-chart-remote', saveAndTestRemoteAutoChart);
    ipcMain.on('search-youtube', searchYoutube);
    ipcMain.on('my-music-fetch', fetchMyMusic);
    ipcMain.on('load-library-candidates', (event) => {
      loadLibraryCandidates(event, this.librarySourcesDirectory());
    });

    ipcMain.on('check-stem-tools', checkStemTools);
    ipcMain.on('check-stem-tools-update', checkStemToolsUpdate);
    ipcMain.on('download-stem-tools', downloadStemTools);
    ipcMain.on('cancel-stem-tools', cancelStemTools);
    ipcMain.on('delete-stem-tools', deleteStemTools);

    ipcMain.on('split-song', splitSong);
    ipcMain.on('cancel-split', cancelSplit);

    ipcMain.on('update-song', updateSong);
    ipcMain.on('save-practice-run', savePracticeRun);
    ipcMain.on('load-practice-runs', loadPracticeRuns);
    ipcMain.on('get-coach-settings', getCoachSettings);
    ipcMain.on('save-coach-settings', saveCoachSettings);
    ipcMain.on('get-coaching-notes', getCoachingNotes);
    ipcMain.on('record-practice-day', recordPracticeDay);
    ipcMain.on('load-practice-days', loadPracticeDays);
    ipcMain.on('load-all-practice-runs', loadAllPracticeRuns);
    ipcMain.on('load-retired-lessons', loadRetiredLessons);
    ipcMain.on('save-goal', saveGoal);
    ipcMain.on('load-goals', loadGoalsIpc);
    ipcMain.on('delete-goal', deleteGoal);
    ipcMain.on('set-primary-goal', setPrimaryGoal);
    ipcMain.on('export-pdf', exportPdf);
    ipcMain.on('midi-device-list', loadMidiDeviceList);
    ipcMain.on('listen-midi', listenMidi);
    ipcMain.on('stop-listen-midi', stopListenMidi);

    ipcMain.on('open-song-directory', (_event, dir: string) => {
      shell.openPath(dir);
    });
    ipcMain.on('check-dev', (event) => {
      event.reply('check-dev', isDebug);
    });
    ipcMain.on('like-song', (event, id, liked) => {
      this.store.set(`songs.${id}.liked`, liked);
    });
    ipcMain.on('prevent-sleep', () => this.preventSleep());
    ipcMain.on('resume-sleep', () => this.resumeSleep());
  }

  private bundledLessonDirectory(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'lesson-library')
      : path.resolve(__dirname, '../../web/public/library');
  }

  private librarySourcesDirectory(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'library-sources')
      : path.resolve(__dirname, '../../resources/library-sources');
  }

  private bootstrapBundledLessons(): void {
    try {
      const existingLibraryRoot = this.store.get('lastOpenedPath') as
        | string
        | undefined;
      const existingSongs =
        (this.store.get('songs') as StorageSchema['songs'] | undefined) ?? {};
      const result = bootstrapLessonLibrary({
        bundledRoot: this.bundledLessonDirectory(),
        userDataRoot: app.getPath('userData'),
        existingLibraryRoot,
        existingSongs,
      });

      if (result.libraryRoot) {
        this.lessonLibraryRoot = result.libraryRoot;
      }

      applyLessonProfileMigration(this.store, result);

      if (!existingLibraryRoot && result.libraryRoot) {
        this.setLibraryRoot(result.libraryRoot);
      }
    } catch (error) {
      console.warn('Could not install bundled lesson library:', error);
    }
  }

  async createWindow(): Promise<void> {
    const RESOURCES_PATH = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../../assets');
    const getAssetPath = (...paths: string[]): string => {
      return path.join(RESOURCES_PATH, ...paths);
    };

    this.mainWindow = new BrowserWindow({
      show: false,
      x: 0,
      y: 0,
      ...MAIN_WINDOW_SIZE,
      icon:
        process.platform === 'win32'
          ? getAssetPath('icon.ico')
          : process.platform === 'linux'
          ? getAssetPath('icons', '512x512.png')
          : getAssetPath('icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        backgroundThrottling: false,
      },
    });
    this.mainWindow.loadURL(resolveHtmlPath('index.html'));
    this.mainWindow.on('ready-to-show', () => {
      if (!this.mainWindow) {
        throw new Error('"mainWindow" is not defined');
      }

      if (process.env.START_MINIMIZED) {
        this.mainWindow.minimize();
      } else {
        this.mainWindow.maximize();
        this.mainWindow.show();
      }
    });
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(this.mainWindow);

    menuBuilder.buildMenu();
    this.mainWindow.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);

      return { action: 'deny' };
    });
    AppUpdater.attach(this.mainWindow);
  }

  preventSleep(): void {
    if (this.powerSaveBlockerId === -1) {
      this.powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    }
  }

  resumeSleep(): void {
    if (this.powerSaveBlockerId !== -1) {
      powerSaveBlocker.stop(this.powerSaveBlockerId);
      this.powerSaveBlockerId = -1;
    }
  }

  cleanup(): void {
    this.resumeSleep();
    stopListenMidi();
    killActiveSplit();
    cancelStemTools();
    void autoChartQueue.shutdown();
  }
}

export const appState = AppState.getInstance();
