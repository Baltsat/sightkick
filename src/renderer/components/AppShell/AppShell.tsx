import { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faHouse,
  faMusic,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import './AppShell.css';

export type ArenaView = 'home' | 'songs' | 'journey' | 'insights';

interface AppShellProps {
  view: ArenaView;
  onViewChange: (view: ArenaView) => void;
  statusSlot?: ReactNode;
  settingsSlot: ReactNode;
  onOpenProfile: () => void;
  runOpen?: boolean;
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
    testId: 'view-lessons',
  },
];
const VIEW_LABELS: Record<ArenaView, string> = {
  home: 'Home',
  songs: 'Songs',
  journey: 'Journey',
  insights: 'Profile',
};

export function AppShell({
  view,
  onViewChange,
  settingsSlot,
  onOpenProfile,
  runOpen = false,
  children,
}: AppShellProps) {
  return (
    <div
      className="arena-shell"
      data-view={view}
      data-run-open={runOpen ? 'true' : undefined}
    >
      <aside
        className="arena-shell__rail"
        aria-label="Drumroll navigation"
        aria-hidden={runOpen || undefined}
        hidden={runOpen}
      >
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
                title={item.label}
                aria-label={`Open ${item.label}`}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => onViewChange(item.id)}
              >
                <FontAwesomeIcon
                  icon={item.icon}
                  fixedWidth
                  aria-hidden="true"
                />
                <span className="arena-shell__nav-label">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={cn(
              'arena-shell__nav-item',
              view === 'insights' && 'arena-shell__nav-item--active',
            )}
            data-testid="open-profile-button"
            title="Profile"
            aria-label="Open your profile"
            aria-current={view === 'insights' ? 'page' : undefined}
            onClick={onOpenProfile}
          >
            <FontAwesomeIcon icon={faUser} fixedWidth aria-hidden="true" />
            <span className="arena-shell__nav-label">Profile</span>
          </button>
          <div className="arena-shell__settings">
            <div className="arena-shell__settings-control">{settingsSlot}</div>
            <span className="arena-shell__settings-label" aria-hidden="true">
              Settings
            </span>
          </div>
        </nav>
      </aside>

      <div className="arena-shell__workspace">
        <main
          className="arena-shell__content"
          aria-label={`${VIEW_LABELS[view]} content`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
