import { ElectronHandler } from '../preload/index';

declare global {
  const __APP_VERSION__: string;

  interface Window {
    electron: ElectronHandler;
  }
}

export {};
