import { Song } from '../../../types';
import { SongSplitProgress } from '../SongSplitProgress';

interface Props {
  splittingIds: Set<string>;
  splitProgress: Map<string, number>;
  songList: Song[];
}

export function SplittingQueue({
  splittingIds,
  splitProgress,
  songList,
}: Props) {
  if (splittingIds.size === 0) {
    return null;
  }

  return (
    // Floats over the page instead of sitting inline in the header — an
    // inline queue would grow/shrink the header as splits start and finish,
    // shoving the song list below it on every job transition.
    <div
      className="fixed bottom-5 left-5 z-50 flex w-96 flex-col gap-3 rounded-2xl border border-border-soft bg-surface-raised p-4 shadow-frame"
      data-testid="splitting-queue"
      role="status"
      aria-live="polite"
    >
      <div className="text-sm font-semibold text-text-body">
        Processing queue
      </div>
      <div className="flex flex-col gap-2">
        {[...splittingIds].map((id) => {
          const songData = songList.find((s) => s.id === id);

          if (!songData) {
            return null;
          }

          return (
            <SongSplitProgress
              key={id}
              songData={songData}
              progress={splitProgress.get(id) ?? 0}
              onCancel={() =>
                window.electron.ipcRenderer.sendMessage('cancel-split', id)
              }
            />
          );
        })}
      </div>
    </div>
  );
}
