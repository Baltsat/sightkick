import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHeart as faHeartSolid,
  faDownload,
  faSpinner,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { faHeart } from '@fortawesome/free-regular-svg-icons';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import appIcon from '../../../../assets/icon.png';
import { Song } from '../../../types';
import { cn } from '../../cn';
import { Button, Tooltip } from 'antd';
import { useMemo } from 'react';
import { SongMenu } from '../SongMenu';
import { Stars } from '../Stars';
import { IconButton } from '../IconButton';
import { Difficulty } from 'scan-chart';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { DifficultyRing } from './DifficultyRing';
import { OnlineSong } from '../../types';
import { isPlayableEvidence } from '../../../library-sources/playability';

export interface SongListItemProps {
  songData: Song | OnlineSong;
  onLikeChange: (id: string, liked: boolean) => void;
  onDownload: (id: string) => void;
  onClick: () => void;
  onSplit: (id: string) => void;
  /** Omitted when the caller doesn't wire up a goal-setting flow (e.g.
   * Storybook, the online-library rows this menu never renders for). */
  onSetGoal?: (song: Song) => void;
  downloading?: boolean;
  difficulty: Difficulty;
  splitting: boolean;
  downloaded?: boolean;
  downloadingDisabled: boolean;
  focused?: boolean;
}

export function SongListItem({
  songData,
  onLikeChange,
  onDownload,
  onClick,
  downloading,
  downloaded,
  difficulty,
  splitting,
  onSplit,
  onSetGoal,
  downloadingDisabled,
  focused,
}: SongListItemProps) {
  const local = 'source' in songData ? undefined : songData;
  const playable =
    !(local?.sourceLinked || local?.sourceProvenance) ||
    isPlayableEvidence(local.playability);
  const { albumCover, id, name, artist, charter, drumDifficulty } = songData;
  const autoChartTool =
    'autoChartTool' in songData ? songData.autoChartTool : undefined;
  const autoChartToolName = autoChartTool?.split('(')[0].trim();
  const score = useMemo(() => {
    const result = local?.scoreData?.[difficulty];

    return result
      ? {
          starRating: getStarRating(result),
          accuracy: calculateAccuracy(result),
        }
      : null;
  }, [local, difficulty]);
  const indicator = useMemo(() => {
    if (local) {
      return (
        <div className="flex items-center gap-1">
          <SongMenu
            dir={local.dir}
            canSplit={(local.audio?.length ?? 0) === 1}
            splitting={splitting}
            onSplit={() => onSplit(id)}
            onSetGoal={onSetGoal && (() => onSetGoal(local))}
          />

          <IconButton
            data-testid="like-toggle"
            type={local.liked ? 'primary' : 'default'}
            size="lg"
            aria-label={local.liked ? `Unlike ${name}` : `Like ${name}`}
            aria-pressed={Boolean(local.liked)}
            icon={local.liked ? faHeartSolid : faHeart}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLikeChange(id, !local.liked);
            }}
          />
        </div>
      );
    }

    if (!downloading && !downloaded) {
      const button = (
        <Button
          icon={<FontAwesomeIcon icon={faDownload} />}
          size="large"
          aria-label={`Download ${name}`}
          disabled={downloadingDisabled}
          data-testid="download-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDownload(id);
          }}
        />
      );

      return downloadingDisabled ? (
        <Tooltip
          title="To enable download, select library folder"
          placement="left"
        >
          {button}
        </Tooltip>
      ) : (
        button
      );
    }

    return (
      <FontAwesomeIcon
        className={cn(downloading ? 'text-text-dim' : 'text-accent', 'px-1.5')}
        size="xl"
        icon={downloading ? faSpinner : faCheck}
        spin={downloading}
        data-testid={
          downloading ? 'downloading-indicator' : 'downloaded-indicator'
        }
      />
    );
  }, [
    downloading,
    downloaded,
    onDownload,
    id,
    local,
    onLikeChange,
    downloadingDisabled,
    onSplit,
    onSetGoal,
    splitting,
    name,
  ]);

  return (
    <div className="relative inline-flex w-full">
      <div
        onClick={playable ? onClick : undefined}
        onKeyDown={(event) => {
          if (
            local &&
            playable &&
            event.currentTarget === event.target &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();
            onClick();
          }
        }}
        role={local && playable ? 'button' : undefined}
        tabIndex={local && playable ? 0 : undefined}
        aria-label={local && playable ? `Play ${name}` : undefined}
        aria-disabled={local && !playable ? true : undefined}
        data-testid={`song-item-${id}`}
        data-focused={focused ? 'true' : undefined}
        className={cn(
          'flex min-w-0 border border-border-soft grow no-underline bg-surface rounded-xl duration-100 ease-out cursor-default p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          {
            'hover:bg-accent-soft-bg hover:border-accent-soft-border cursor-pointer transition-[background-color,border-color,box-shadow]':
              Boolean(local && playable),
            'bg-accent-soft-bg border-accent-soft-border outline-2 outline-accent shadow-accent-soft':
              focused,
          },
        )}
      >
        <div className="flex min-w-0 items-center">
          <img
            src={albumCover ?? appIcon}
            alt={albumCover ? `${name} album cover` : ''}
            onError={(e) => {
              e.currentTarget.src = appIcon;
            }}
            className="size-14 shrink-0 object-cover rounded-lg shadow-frame outline outline-1 -outline-offset-1 outline-white/10"
          />

          <div className="ml-3 min-w-0">
            <div
              className="truncate font-display text-lg font-semibold leading-tight text-text-body"
              title={name}
            >
              {name}
            </div>
            <div
              className="mt-1 truncate font-ui text-sm text-text-muted"
              title={artist}
            >
              {artist}
            </div>
          </div>
        </div>

        <div className="flex ml-auto shrink-0 items-center gap-4 pl-4">
          {charter && (
            <div className="hidden max-w-32 flex-col items-end xl:flex">
              <div className="text-text-dim text-xs">charter</div>
              <div
                className="mt-1 max-w-full truncate text-sm text-text-muted"
                title={charter.replace(/<\S+?>/g, '')}
              >
                {charter.replace(/<\S+?>/g, '')}
              </div>
            </div>
          )}

          {autoChartToolName && (
            <Tooltip title={`Auto-charted with ${autoChartToolName}`}>
              <span
                className="hidden items-center text-text-dim xl:inline-flex"
                tabIndex={0}
                aria-label={`Auto-charted with ${autoChartToolName}`}
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} />
              </span>
            </Tooltip>
          )}

          {local && (
            <div className="flex flex-col gap-1 items-center">
              <div className="text-xs capitalize text-text-dim">
                {difficulty}
              </div>

              <Tooltip
                title={
                  score
                    ? `Best score: ${Math.round(
                        score.accuracy * 100,
                      )}% accuracy`
                    : 'Play once to earn stars'
                }
              >
                <div
                  className="text-xs text-text-faint text-center"
                  tabIndex={0}
                  aria-label={
                    score
                      ? `Best score: ${Math.round(
                          score.accuracy * 100,
                        )}% accuracy`
                      : 'No best score yet. Play once to earn stars'
                  }
                >
                  {score ? (
                    <div aria-hidden="true">
                      <Stars
                        rating={score.starRating}
                        perfect={score.accuracy === 1}
                        size="xs"
                        className="gap-1"
                      />
                    </div>
                  ) : (
                    'play once to earn stars'
                  )}
                </div>
              </Tooltip>
            </div>
          )}

          {local && !playable && (
            <Tooltip title="This source-linked song still needs identity, lawful audio, reviewed chart, scan-chart, and launch proof">
              <span
                className="text-xs text-orange"
                aria-label={`${name} is not playable yet`}
              >
                Needs proof
              </span>
            </Tooltip>
          )}

          <DifficultyRing value={drumDifficulty} />

          {indicator}
        </div>
      </div>
    </div>
  );
}
