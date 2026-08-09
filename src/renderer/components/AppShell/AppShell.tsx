import { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faHouse,
  faMusic,
  faSun,
  faUser,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import './AppShell.css';

export type ArenaView = 'home' | 'songs' | 'journey' | 'coach';

interface AppShellProps {
  view: ArenaView;
  onViewChange: (view: ArenaView) => void;
  statusSlot: ReactNode;
  settingsSlot: ReactNode;
  onOpenProfile: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  id: ArenaView;
  label: string;
  icon: typeof faHouse;
  testId: string;
}> = [
  { id: 'home', label: 'Home', icon: faHouse, testId: 'view-home' },
  { id: 'songs', label: 'Songs', icon: faMusic, testId: 'view-songs' },
  {
    id: 'journey',
    label: 'Journey',
    icon: faBookOpen,
    // Keep the original hook used by keyboard and component tests. The
    // visible label has deliberately moved from "Lessons" to "Journey".
    testId: 'view-lessons',
  },
  {
    id: 'coach',
    label: 'Coach',
    icon: faWandMagicSparkles,
    testId: 'view-coach',
  },
];

/**
 * Persistent desktop/web chrome for Daybreak Arena. It owns navigation only:
 * song data and input state remain in SongListView so opening a practice run
 * does not reset a list, a goal, or a score cache.
 */
export function AppShell({
  view,
  onViewChange,
  statusSlot,
  settingsSlot,
  onOpenProfile,
  children,
}: AppShellProps) {
  return (
    <div className="arena-shell">
      <aside className="arena-shell__rail" aria-label="Drumroll navigation">
        <button
          type="button"
          className="arena-shell__brand"
          onClick={() => onViewChange('home')}
          aria-label="Drumroll home"
        >
          <span className="arena-shell__brand-mark" aria-hidden="true">
            <FontAwesomeIcon icon={faWandMagicSparkles} />
          </span>
          <span>
            <strong>Drumroll</strong>
            <small>Daybreak Arena</small>
          </span>
        </button>

        <nav className="arena-shell__nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isCurrent = item.id === view;

            return (
              <button
                key={item.id}
                type="button"
                data-testid={item.testId}
                data-journey-control={item.id === 'journey' || undefined}
                className={cn(
                  'arena-shell__nav-item',
                  isCurrent && 'arena-shell__nav-item--active',
                )}
                aria-label={`Open ${item.label}`}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => onViewChange(item.id)}
              >
                <FontAwesomeIcon
                  icon={item.icon}
                  fixedWidth
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <p className="arena-shell__rail-note">
          Learn the motion.
          <br />
          Own the room.
        </p>
      </aside>

      <div className="arena-shell__workspace">
        <header className="arena-shell__topbar">
          <div className="arena-shell__eyebrow">
            <FontAwesomeIcon
              className="arena-shell__sun"
              icon={faSun}
              aria-hidden="true"
            />
            <span>{view === 'home' ? 'Practice cockpit' : view}</span>
          </div>
          <div className="arena-shell__actions">
            <div className="arena-shell__status">{statusSlot}</div>
            {settingsSlot}
            <button
              type="button"
              className="arena-shell__profile"
              data-testid="open-profile-button"
              aria-label="Open your profile"
              onClick={onOpenProfile}
            >
              <FontAwesomeIcon icon={faUser} aria-hidden="true" />
              <span className="arena-shell__profile-label">Profile</span>
            </button>
          </div>
        </header>
        <main className="arena-shell__content">{children}</main>
      </div>
    </div>
  );
}
