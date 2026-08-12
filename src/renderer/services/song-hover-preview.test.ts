import { describe, expect, it, vi } from 'vitest';
import { Song } from '../../types';
import { buildParsedChartFromDsl } from '../components/SheetMusic/helpers';
import {
  HOVER_PREVIEW_FADE_MS,
  HOVER_PREVIEW_INTENT_MS,
  SongHoverPreviewController,
  SongPreviewSource,
  selectDrumPreviewWindow,
} from './song-hover-preview';

class FakePreviewAudio {
  src = '';
  preload = '';
  currentTime = 0;
  volume = 1;
  onended: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

function song(id: string): Song {
  return {
    id,
    dir: `/songs/${id}`,
    name: id,
    artist: 'Drumroll',
    album: '',
    charter: '',
    genre: '',
    year: '',
    fiveLaneDrums: false,
    proDrums: false,
    delaySeconds: 0,
    drumDifficulty: 5,
    format: 'chart',
    audio: [{ name: 'song', src: `file:///${id}.ogg` }],
  };
}

function denseBar(dense: boolean): string {
  const hits = dense
    ? Array.from({ length: 8 }, (_, index) => `${index * 240} kick yellow`)
    : ['0 kick'];

  return ['res=480 ts=4/4', ...hits].join('\n');
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('song hover preview', () => {
  it('chooses the dense middle of a parsed drum chart on bar boundaries', () => {
    const chart = buildParsedChartFromDsl(
      Array.from({ length: 12 }, (_, index) => denseBar(index >= 6)).join(
        '\n\n',
      ),
    );
    const preview = selectDrumPreviewWindow(chart, 'expert', false);

    expect(preview).toMatchObject({
      startBar: 7,
      endBar: 12,
      startSeconds: 12,
      endSeconds: 24,
    });
    expect(preview?.noteCount).toBe(96);
  });

  it('waits for hover intent, fades a preview out, and keeps repeat hovers cached', async () => {
    vi.useFakeTimers();

    const source: SongPreviewSource = {
      src: 'file:///song.ogg',
      startSeconds: 24,
      endSeconds: 36,
      startBar: 13,
      endBar: 18,
      noteCount: 120,
      label: 'Drum peak · bars 13–18',
    };
    const load = vi.fn(async () => source);
    const audios: FakePreviewAudio[] = [];
    const states: string[] = [];
    const controller = new SongHoverPreviewController({
      load,
      createAudio: () => {
        const audio = new FakePreviewAudio();

        audios.push(audio);

        return audio;
      },
      onChange: (state) => states.push(state?.songId ?? 'idle'),
    });
    const first = song('first');

    controller.hover(first, 'expert');
    vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS - 1);
    expect(load).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flushPromises();

    expect(load).toHaveBeenCalledTimes(1);
    expect(audios[0]?.play).toHaveBeenCalledOnce();
    expect(audios[0]?.currentTime).toBe(24);
    expect(states.at(-1)).toBe('first');

    controller.leave(first.id);
    vi.advanceTimersByTime(HOVER_PREVIEW_FADE_MS + 16);

    expect(audios[0]?.pause).toHaveBeenCalledOnce();
    expect(states.at(-1)).toBe('idle');

    controller.hover(first, 'expert');
    vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS);
    await flushPromises();

    expect(load).toHaveBeenCalledTimes(1);
    expect(audios[1]?.play).toHaveBeenCalledOnce();
  });

  it('does not begin a preview after its row is left during chart loading', async () => {
    vi.useFakeTimers();

    const source: SongPreviewSource = {
      src: 'file:///song.ogg',
      startSeconds: 24,
      endSeconds: 36,
      startBar: 13,
      endBar: 18,
      noteCount: 120,
      label: 'Drum peak · bars 13–18',
    };
    let resolve: (value: SongPreviewSource) => void = () => {};
    const load = vi.fn(
      () => new Promise<SongPreviewSource>((next) => (resolve = next)),
    );
    const audios: FakePreviewAudio[] = [];
    const controller = new SongHoverPreviewController({
      load,
      createAudio: () => {
        const audio = new FakePreviewAudio();

        audios.push(audio);

        return audio;
      },
    });
    const first = song('first');

    controller.hover(first, 'expert');
    vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS);
    controller.leave(first.id);
    resolve(source);
    await flushPromises();

    expect(audios).toHaveLength(0);
  });

  it('stays silent for an unverified source-linked song', () => {
    vi.useFakeTimers();

    const load = vi.fn();
    const controller = new SongHoverPreviewController({ load });
    const unverified = { ...song('unverified'), sourceLinked: true };

    controller.hover(unverified, 'expert');
    vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS);

    expect(load).not.toHaveBeenCalled();
  });
});
