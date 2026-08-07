import { Button, Input } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faGlobe, faSearch } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { Tooltip } from '../Tooltip';
import { ALL_DIFFICULTIES } from '../../../constants';
import { Difficulty } from 'scan-chart';
import { LibraryMode } from '../../types';

export interface SongFilterProps {
  onChangeFilter: (value: string) => void;
  nameFilter: string;
  className?: string;
  filteredSongsCount: number;
  libraryMode: LibraryMode;
  onChangeLibraryMode: (value: LibraryMode) => void;
  difficulty: Difficulty;
  setDifficulty: (newDifficulty: Difficulty) => void;
}

export function SongFilter({
  onChangeFilter,
  onChangeLibraryMode,
  libraryMode = 'local',
  nameFilter,
  className,
  difficulty,
  setDifficulty,
  filteredSongsCount,
}: SongFilterProps) {
  const options = [
    {
      icon: <FontAwesomeIcon icon={faFolder} />,
      value: 'local',
      tooltipText: "Songs you've already got on your machine",
    },
    {
      icon: <FontAwesomeIcon icon={faGlobe} />,
      value: 'online',
      tooltipText: 'Go hunting for new songs to download',
    },
  ] as const;

  return (
    <div
      className={cn(
        'flex min-w-0 grow flex-wrap items-center gap-2',
        className,
      )}
      data-testid="library-filters"
    >
      <div className="min-w-64 grow" data-testid="library-name-filter">
        <label className="sr-only" htmlFor="library-song-filter">
          Filter your library
        </label>
        <Input
          id="library-song-filter"
          prefix={
            <FontAwesomeIcon icon={faSearch} color="var(--color-text-dim)" />
          }
          data-testid="song-search"
          placeholder="Filter songs…"
          value={nameFilter}
          onChange={(event) => {
            onChangeFilter(event.target.value);
          }}
          suffix={
            <span
              className="whitespace-nowrap text-[13.5px] text-text-faint tabular-nums"
              role="status"
            >
              {filteredSongsCount} results
            </span>
          }
        />
      </div>

      <Tooltip
        title={
          <div>
            <p>
              Choose the drum part you want to play, from a simplified Easy
              chart to the full Expert chart.
            </p>
            <br />
            <p>A song is hidden when it has no chart at that difficulty.</p>
          </div>
        }
      >
        <div
          className="flex shrink-0 items-center gap-1 rounded-xl bg-fill p-1"
          role="group"
          aria-label="Difficulty"
        >
          {ALL_DIFFICULTIES.map((d) => (
            <Button
              key={d}
              className="min-w-18 capitalize"
              type={difficulty === d ? 'primary' : 'default'}
              data-testid={`difficulty-${d}`}
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </Button>
          ))}
        </div>
      </Tooltip>

      <div
        className="flex shrink-0 items-center gap-1 rounded-xl bg-fill p-1"
        role="group"
        aria-label="Library source"
      >
        {options.map((option) => (
          <Tooltip
            key={option.value}
            title={option.tooltipText}
            placement="bottomLeft"
          >
            <Button
              className="min-w-10"
              type={libraryMode === option.value ? 'primary' : 'default'}
              icon={option.icon}
              aria-label={
                option.value === 'local' ? 'Local songs' : 'Online songs'
              }
              aria-pressed={libraryMode === option.value}
              data-testid={`mode-${option.value}`}
              onClick={() => onChangeLibraryMode(option.value)}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
