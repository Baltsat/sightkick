import { Button } from 'antd';
import { Difficulty } from 'scan-chart';
import type { Song } from '../../../types';
import { SongListItem } from '../../components/SongListItem';
import type {
  ActionableLibraryShelf,
  LocalLibraryEntry,
} from './actionable-shelves';

interface ActionableSongShelvesProps {
  shelves: readonly ActionableLibraryShelf[];
  sourceSeededSongIds: ReadonlySet<string>;
  restCount: number;
  difficulty: Difficulty;
  splittingIds: ReadonlySet<string>;
  onPlaySong: (songId: string) => void;
  onLikeChange: (songId: string, liked: boolean) => void;
  onSplit: (songId: string) => void;
  onBrowseAll: () => void;
}

function no_op() {}

function ShelfRow({
  entry,
  sourceSeededSongIds,
  difficulty,
  splittingIds,
  onPlaySong,
  onLikeChange,
  onSplit,
}: {
  entry: LocalLibraryEntry;
  sourceSeededSongIds: ReadonlySet<string>;
  difficulty: Difficulty;
  splittingIds: ReadonlySet<string>;
  onPlaySong: (songId: string) => void;
  onLikeChange: (songId: string, liked: boolean) => void;
  onSplit: (songId: string) => void;
}) {
  const song: Song = entry.song;

  return (
    <SongListItem
      songData={song}
      onLikeChange={onLikeChange}
      onDownload={no_op}
      onClick={() => onPlaySong(song.id)}
      onSplit={onSplit}
      difficulty={difficulty}
      splitting={splittingIds.has(song.id)}
      downloadingDisabled
      tasteSeeded={sourceSeededSongIds.has(song.id)}
    />
  );
}

export function ActionableSongShelves({
  shelves,
  sourceSeededSongIds,
  restCount,
  difficulty,
  splittingIds,
  onPlaySong,
  onLikeChange,
  onSplit,
  onBrowseAll,
}: ActionableSongShelvesProps) {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-360 flex-col overflow-y-auto px-5 py-5"
      data-testid="actionable-song-shelves"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {shelves.map((shelf) => (
          <section
            key={shelf.id}
            data-testid={`library-shelf-${shelf.id}`}
            aria-labelledby={`library-shelf-${shelf.id}-title`}
          >
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2
                  id={`library-shelf-${shelf.id}-title`}
                  className="font-display text-2xl font-semibold tracking-[-0.02em] text-text-body"
                >
                  {shelf.title}
                </h2>
                <p className="mt-1 text-sm text-text-muted">{shelf.detail}</p>
              </div>
              {shelf.entries.length > 0 && (
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
                  {shelf.entries.length}
                </span>
              )}
            </div>

            {shelf.entries.length > 0 ? (
              <div className="border-t border-border-soft">
                {shelf.entries.map((entry) => (
                  <ShelfRow
                    key={entry.key}
                    entry={entry}
                    sourceSeededSongIds={sourceSeededSongIds}
                    difficulty={difficulty}
                    splittingIds={splittingIds}
                    onPlaySong={onPlaySong}
                    onLikeChange={onLikeChange}
                    onSplit={onSplit}
                  />
                ))}
              </div>
            ) : (
              <p
                className="border-y border-border-soft py-4 text-sm text-text-muted"
                data-testid={`library-shelf-${shelf.id}-empty`}
              >
                {shelf.empty}
              </p>
            )}
          </section>
        ))}

        {restCount > 0 && (
          <div className="border-t border-border-soft pt-5">
            <Button
              size="large"
              data-testid="browse-all-library"
              onClick={onBrowseAll}
            >
              Browse the rest of your library ({restCount})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
