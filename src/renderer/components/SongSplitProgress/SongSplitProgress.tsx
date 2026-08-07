import { Song } from '../../../types';
import appIcon from '../../../../assets/icon.png';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { IconButton } from '../IconButton';

type Props = {
  songData: Song;
  progress: number;
  onCancel: () => void;
};

export function SongSplitProgress({
  songData: { albumCover, name },
  progress,
  onCancel,
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border-soft bg-surface">
      <div className="flex items-center gap-2 p-2">
        <img
          src={albumCover ?? appIcon}
          onError={(e) => {
            e.currentTarget.src = appIcon;
          }}
          className="size-7 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-white/10"
        />

        <div className="min-w-0 grow truncate text-[13px] font-semibold text-text-body">
          {name}
        </div>

        <IconButton icon={faXmark} onClick={onCancel} />
      </div>

      <div
        className="h-0.75"
        style={{
          background: 'var(--gradient-slider-fill)',
          width: `${progress}%`,
        }}
      ></div>
    </div>
  );
}
