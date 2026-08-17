import { Difficulty } from 'scan-chart';
import { Button } from 'antd';
import type { Song } from '../../../types';
import { SongListItem } from '../../components/SongListItem';
import type {
  ActionableLibraryShelf,
  LocalLibraryEntry,
} from './actionable-shelves';
import './ActionableSongShelves.css';

interface ActionableSongShelvesProps {
  shelves: readonly ActionableLibraryShelf[];
  sourceSeededSongIds: ReadonlySet<string>;
  allEntries?: readonly LocalLibraryEntry[];
  restCount?: number;
  difficulty: Difficulty;
  splittingIds: ReadonlySet<string>;
  onPlaySong: (songId: string) => void;
  onLikeChange: (songId: string, liked: boolean) => void;
  onSplit: (songId: string) => void;
  onBrowseAll?: () => void;
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
  allEntries,
  restCount = 0,
  difficulty,
  splittingIds,
  onPlaySong,
  onLikeChange,
  onSplit,
  onBrowseAll,
}: ActionableSongShelvesProps) {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-360 flex-col overflow-y-auto px-5 py-4"
      data-testid="actionable-song-shelves"
    >
      <div className="actionable-song-shelves__grid w-full">
        {shelves.map((shelf) => (
          <section
            key={shelf.id}
            className={
              shelf.id === 'ready-now' || shelf.id === 'favourites'
                ? 'actionable-song-shelves__primary min-w-0'
                : 'actionable-song-shelves__secondary min-w-0'
            }
            data-testid={`library-shelf-${shelf.id}`}
            aria-labelledby={`library-shelf-${shelf.id}-title`}
          >
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <h2
                  id={`library-shelf-${shelf.id}-title`}
                  className="font-display text-2xl font-semibold tracking-[-0.02em] text-text-body"
                >
                  {shelf.title}
                </h2>
                <p className="mt-0.5 text-sm text-text-muted">{shelf.detail}</p>
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

        {allEntries && (
          <section
            className="actionable-song-shelves__all min-w-0"
            data-testid="library-full-scroll"
            aria-labelledby="library-full-scroll-title"
          >
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <h2
                  id="library-full-scroll-title"
                  className="font-display text-2xl font-semibold tracking-[-0.02em] text-text-body"
                >
                  Library
                </h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  More songs follow your top picks. Practice fit, favourites,
                  taste, recent plays, and difficulty set the order.
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
                {allEntries.length}
              </span>
            </div>
            <div className="border-t border-border-soft">
              {allEntries.map((entry) => (
                <ShelfRow
                  key={`full-${entry.key}`}
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
          </section>
        )}

        {restCount > 0 && onBrowseAll && (
          <div className="actionable-song-shelves__browse border-t border-border-soft pt-4">
            <Button
              size="large"
              data-testid="browse-all-library"
              onClick={onBrowseAll}
            >
              Show playlist songs ({restCount})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
