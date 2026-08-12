import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBullseye,
  faFolder,
  faHandScissors,
} from '@fortawesome/free-solid-svg-icons';
import { Divider } from 'antd';

interface Props {
  showSplit: boolean;
  splitting: boolean;
  onOpenDirectory: () => void;
  onSplit: () => void;
  /** Omitted entirely when the caller has no goal-setting flow wired up —
   * keeps this menu usable standalone (e.g. Storybook) without a Goals
   * dependency. */
  onSetGoal?: () => void;
}

export function SongMenuContent({
  showSplit,
  splitting,
  onOpenDirectory,
  onSplit,
  onSetGoal,
}: Props) {
  return (
    <>
      <button
        className="flex items-center gap-3 px-4 py-2 text-text-muted hover:text-text cursor-pointer bg-transparent border-0 whitespace-nowrap w-full text-left"
        onClick={onOpenDirectory}
      >
        <FontAwesomeIcon icon={faFolder} className="w-4" />
        Open song directory
      </button>

      {onSetGoal && (
        <button
          className="flex items-center gap-3 px-4 py-2 text-text-muted hover:text-text cursor-pointer bg-transparent border-0 whitespace-nowrap w-full text-left"
          data-testid="song-menu-set-goal"
          onClick={onSetGoal}
        >
          <FontAwesomeIcon icon={faBullseye} className="w-4" />
          Set a goal
        </button>
      )}

      {showSplit && (
        <>
          <Divider />

          <button
            className="flex items-center gap-3 px-4 py-2 text-text-muted hover:text-text cursor-pointer bg-transparent border-0 whitespace-nowrap w-full text-left disabled:opacity-40 disabled:cursor-default"
            disabled={splitting}
            onClick={onSplit}
          >
            <FontAwesomeIcon icon={faHandScissors} className="w-4" />
            {splitting ? 'Splitting…' : 'Split stems'}
          </button>
        </>
      )}
    </>
  );
}
