import { useState } from 'react';
import { Button, Checkbox, DatePicker, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Difficulty } from 'scan-chart';
import { ALL_DIFFICULTIES } from '../../../constants';
import { Song } from '../../../types';
import { Goal, SaveGoalInput } from './useGoals';

export interface SetGoalModalProps {
  open: boolean;
  onClose: () => void;
  /** Every local song, for the song picker. */
  songList: Song[];
  /** Preselects (and locks in, from the caller's point of view) a song —
   * set when the modal was opened from a song's own row/menu, where the
   * target is already known. Left undefined for the Profile's "Set a
   * goal" entry point, where the player picks the song here. */
  initialSongId?: string;
  /** When set, the modal edits this goal in place (same id, `saveGoal`
   * updates rather than creates) instead of creating a new one. */
  editingGoal?: Goal;
  /** True when this would be the very first goal ever created — used only
   * to default the "make this primary" checkbox; the actual default also
   * lives in `src/main/ipc/goals.ts` so it's correct even if this prop is
   * ever wrong. */
  isFirstGoal?: boolean;
  onSave: (input: SaveGoalInput) => void;
}

/** Renders a `Song`'s title and artist as one search/select label. */
function songLabel(song: Song): string {
  return `${song.name} — ${song.artist}`;
}

interface GoalFormProps {
  onClose: () => void;
  songList: Song[];
  initialSongId?: string;
  editingGoal?: Goal;
  isFirstGoal?: boolean;
  onSave: (input: SaveGoalInput) => void;
}

/**
 * The actual form. Split out from `SetGoalModal` and mounted with a `key`
 * derived from the target identity (see below) rather than an effect that
 * calls `setState` on prop change — remounting is the React-idiomatic way
 * to reset local state when "what we're editing" changes, and this
 * codebase's lint config (`react-hooks/set-state-in-effect`) specifically
 * disallows the effect-based version of this.
 */
function GoalForm({
  onClose,
  songList,
  initialSongId,
  editingGoal,
  isFirstGoal,
  onSave,
}: GoalFormProps) {
  const [songId, setSongId] = useState<string | undefined>(
    editingGoal?.songId ?? initialSongId,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    editingGoal?.difficulty ?? 'expert',
  );
  const [targetDate, setTargetDate] = useState<Dayjs | null>(
    editingGoal?.targetDate ? dayjs(editingGoal.targetDate) : null,
  );
  const [isPrimary, setIsPrimary] = useState(
    editingGoal?.isPrimary ?? isFirstGoal ?? false,
  );
  const selectedSong = songList.find((song) => song.id === songId);
  const difficultyOptions = selectedSong?.drumDifficulties?.length
    ? ALL_DIFFICULTIES.filter((d) => selectedSong.drumDifficulties!.includes(d))
    : ALL_DIFFICULTIES;
  const canSave = Boolean(songId && difficulty);
  const handleSave = () => {
    if (!songId) {
      return;
    }

    onSave({
      id: editingGoal?.id,
      songId,
      difficulty,
      targetDate: targetDate ? targetDate.format('YYYY-MM-DD') : undefined,
      isPrimary,
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-faint">
          Song
        </span>
        <Select
          showSearch
          data-testid="goal-song-select"
          value={songId}
          placeholder="Pick a song to master"
          // Pre-filled (not disabled) when opened from a song's row: the
          // song is right most of the time, but a disabled antd Select
          // renders its label at a contrast that's nearly illegible
          // against this app's warm-dark theme, and there's no real harm
          // in letting the player switch songs even from the contextual
          // entry point.
          optionFilterProp="label"
          options={songList.map((song) => ({
            value: song.id,
            label: songLabel(song),
          }))}
          onChange={(value) => setSongId(value)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-faint">
          Difficulty
        </span>
        <Select
          data-testid="goal-difficulty-select"
          value={difficulty}
          options={difficultyOptions.map((d) => ({
            value: d,
            label: d.charAt(0).toUpperCase() + d.slice(1),
          }))}
          onChange={(value) => setDifficulty(value)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-text-faint">
          Target date (optional)
        </span>
        <DatePicker
          data-testid="goal-target-date"
          className="w-full"
          value={targetDate}
          onChange={(value) => setTargetDate(value)}
          disabledDate={(date) => date.isBefore(dayjs().startOf('day'))}
        />
      </label>

      <Checkbox
        data-testid="goal-is-primary"
        checked={isPrimary}
        onChange={(event) => setIsPrimary(event.target.checked)}
      >
        Make this my primary goal
      </Checkbox>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          disabled={!canSave}
          data-testid="save-goal-button"
          onClick={handleSave}
        >
          {editingGoal ? 'Save changes' : 'Set goal'}
        </Button>
      </div>
    </div>
  );
}

export function SetGoalModal({
  open,
  onClose,
  songList,
  initialSongId,
  editingGoal,
  isFirstGoal,
  onSave,
}: SetGoalModalProps) {
  return (
    <Modal
      title={editingGoal ? 'Edit goal' : 'Set a goal'}
      open={open}
      onCancel={onClose}
      data-testid="set-goal-modal"
      footer={null}
    >
      <GoalForm
        // Target identity, not `open` — remounts (resetting the form's
        // local state) exactly when the thing being edited changes, and
        // stays put across the same target being closed and reopened
        // (e.g. after a Cancel) so an in-progress edit isn't lost to a
        // stray remount.
        key={`${editingGoal?.id ?? 'new'}:${initialSongId ?? ''}`}
        onClose={onClose}
        songList={songList}
        initialSongId={initialSongId}
        editingGoal={editingGoal}
        isFirstGoal={isFirstGoal}
        onSave={onSave}
      />
    </Modal>
  );
}
