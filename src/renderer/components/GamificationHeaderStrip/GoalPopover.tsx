import { Popover } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullseye } from '@fortawesome/free-solid-svg-icons';
import { popoverOpenChange, popoverStyles } from '../../overlayStyles';
import { cn } from '../../cn';
import {
  GOAL_OPTIONS,
  GOAL_XP_BY_OPTION,
  GoalOption,
} from '../../hooks/useGamification';

interface Props {
  goalOption: GoalOption;
  onChange: (option: GoalOption) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const GOAL_LABELS: Record<GoalOption, string> = {
  casual: 'Casual',
  regular: 'Regular',
  serious: 'Serious',
  intense: 'Intense',
};

export function GoalPopover({
  goalOption,
  onChange,
  isOpen,
  onOpenChange,
}: Props) {
  return (
    <Popover
      open={isOpen}
      onOpenChange={popoverOpenChange(onOpenChange)}
      trigger="click"
      placement="bottomRight"
      styles={popoverStyles}
      content={
        <div
          className="flex min-w-52 flex-col gap-1"
          data-testid="goal-popover-menu"
        >
          <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
            Daily goal
          </div>
          {GOAL_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`goal-option-${option}`}
              aria-pressed={option === goalOption}
              onClick={() => {
                onChange(option);
                onOpenChange(false);
              }}
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                option === goalOption
                  ? 'bg-accent-soft-bg text-accent-text'
                  : 'text-text-body hover:bg-fill',
              )}
            >
              <span>{GOAL_LABELS[option]}</span>
              <span className="tabular-nums text-text-faint">
                {GOAL_XP_BY_OPTION[option]} XP
              </span>
            </button>
          ))}
        </div>
      }
    >
      <button
        type="button"
        data-testid="goal-popover-trigger"
        aria-label="Change daily XP goal"
        onClick={(event) => event.stopPropagation()}
        className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-text-faint hover:bg-fill hover:text-text-body"
      >
        <FontAwesomeIcon icon={faBullseye} size="xs" />
        {GOAL_LABELS[goalOption]}
      </button>
    </Popover>
  );
}
