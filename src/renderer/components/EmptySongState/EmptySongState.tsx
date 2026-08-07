import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faFolder, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { Button } from 'antd';
import { LibraryMode } from '../../types';

interface Props {
  libraryMode: LibraryMode;
  hasFolder: boolean;
  hasSongs: boolean;
  query: string;
  onClearFilter: () => void;
  onBrowseOnline: () => void;
}

export function EmptySongState({
  libraryMode,
  hasFolder,
  hasSongs,
  query,
  onClearFilter,
  onBrowseOnline,
}: Props) {
  if (libraryMode === 'online' || hasSongs) {
    const trimmedQuery = query.trim();

    return (
      <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-fill text-text-muted">
          <FontAwesomeIcon icon={faGlobe} />
        </div>
        <h2 className="font-display text-2xl font-semibold text-text-body">
          {trimmedQuery ? `No matches for “${trimmedQuery}”` : 'No songs found'}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">
          Try another title or artist, or clear the search to return to your
          library.
        </p>
        {trimmedQuery && (
          <Button size="large" className="min-h-11" onClick={onClearFilter}>
            Clear search
          </Button>
        )}
      </section>
    );
  }

  if (hasFolder) {
    return (
      <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-fill text-accent-text">
          <FontAwesomeIcon icon={faGlobe} />
        </div>
        <h2 className="font-display text-2xl font-semibold text-text-body">
          Build your practice library
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">
          Find a song online or create a drum chart from a YouTube video.
        </p>
        <Button
          type="primary"
          size="large"
          className="min-h-11"
          onClick={onBrowseOnline}
          icon={<FontAwesomeIcon icon={faGlobe} />}
        >
          Browse online songs
        </Button>
      </section>
    );
  }

  return (
    <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-fill text-accent-text">
        <FontAwesomeIcon icon={faFolder} />
      </div>
      <h2 className="font-display text-2xl font-semibold text-text-body">
        Choose your library folder
      </h2>
      <p className="text-sm leading-relaxed text-text-muted">
        Open Settings, then select the folder where SightKick will keep your
        songs and progress.
      </p>
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 text-sm text-text-body">
        <FontAwesomeIcon icon={faCog} />
        <span>Settings</span>
        <span aria-hidden="true">→</span>
        <FontAwesomeIcon icon={faFolder} />
        <span>Select folder</span>
      </div>
    </section>
  );
}
