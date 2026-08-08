import { installWebPlatform } from '.';
import { webCapabilities } from './capabilities';
import { beforeEach, describe, expect, it } from 'vitest';

function reply<T>(request: string, response: string): Promise<T> {
  return new Promise((resolve) => {
    window.electron.ipcRenderer.once(response as never, resolve as never);
    window.electron.ipcRenderer.sendMessage(request as never);
  });
}

describe('web platform channel mapping', () => {
  beforeEach(() => {
    installWebPlatform();
  });

  it('publishes an explicit capability map', () => {
    expect(window.drumrollPlatform).toEqual({
      kind: 'web',
      capabilities: webCapabilities,
    });
    expect(webCapabilities).toMatchObject({
      lessonLibrary: true,
      indexedDbImports: true,
      webMidi: true,
      youtubeImport: true,
      localFolderImport: false,
      stemSplit: false,
      octave: false,
      myMusic: false,
      appUpdates: false,
    });
  });

  it('advertises only the managed remote chart backend', async () => {
    await expect(
      reply('check-auto-chart-backends', 'auto-chart-backends'),
    ).resolves.toEqual({
      sightkick: false,
      remote: true,
      octave: false,
      default: 'remote',
    });
  });

  it('returns an honest unsupported state for desktop stem tools', async () => {
    await expect(
      reply('check-stem-tools', 'check-stem-tools'),
    ).resolves.toEqual({ status: 'unsupported' });
  });
});
