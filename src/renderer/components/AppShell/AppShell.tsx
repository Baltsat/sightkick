import { ReactNode, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faHouse,
  faMusic,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import appIcon from '../../../../assets/icon.png';
import './AppShell.css';

export type ArenaView = 'home' | 'songs' | 'journey' | 'insights';

interface AppShellProps {
  view: ArenaView;
  onViewChange: (view: ArenaView) => void;
  /**
   * Practice/streak evidence. The v3 shell is a quiet rail on a continuous
   * field, not a header bar with chips, so this is intentionally not
   * rendered here anymore — status belongs where it is earned (inside a
   * route), never as permanent chrome. Kept optional so callers built for
   * the old topbar keep compiling; wiring a quiet, reachable home for it
   * inside a route is owned by whichever lane rebuilds that route.
   */
  statusSlot?: ReactNode;
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
];
const VIEW_LABELS: Record<ArenaView, string> = {
  home: 'Home',
  songs: 'Songs',
  journey: 'Journey',
  insights: 'Profile',
};

/**
 * Persistent chrome: a quiet rail on a continuous field. It owns navigation
 * only — song data and input state remain in SongListView so opening a
 * practice run does not reset a list, a goal, or a score cache. There is no
 * header bar: the selected rail item is the only "where am I" signal, and
 * profile/settings sit as quiet controls at the rail foot rather than as a
 * status/action row across the top of every route.
 */
export function AppShell({
  view,
  onViewChange,
  settingsSlot,
  onOpenProfile,
  children,
}: AppShellProps) {
  const previousViewRef = useRef(view);
  const [isFieldTransitioning, setIsFieldTransitioning] = useState(false);

  useEffect(() => {
    if (previousViewRef.current === view) {
      return undefined;
    }

    previousViewRef.current = view;

    setIsFieldTransitioning(true);

    const timer = window.setTimeout(() => setIsFieldTransitioning(false), 900);

    return () => window.clearTimeout(timer);
  }, [view]);

  return (
    <div
      className={cn(
        'arena-shell',
        isFieldTransitioning && 'arena-shell--transitioning',
      )}
      data-view={view}
    >
      <aside className="arena-shell__rail" aria-label="Drumroll navigation">
        {/*
         * The kit-continuity handoff (see docs/kit-launcher-design.md "The
         * field"): on home, the kit photograph should read as continuing
         * underneath the rail rather than stopping dead at the panel edge.
         * HomeCockpit owns that photograph and must not be touched from
         * here, so this is only the shell's half of the contract — a quiet
         * layer that bleeds whatever crop is published and fades to nothing
         * when none is. See AppShell.css for the one-line publishing
         * contract the other lane satisfies via `--dr-home-field-crop`.
         */}
        <div
          className="arena-shell__field-bleed"
          data-testid="arena-shell-field-bleed"
          aria-hidden="true"
        />

        <button
          type="button"
          className="arena-shell__brand"
          onClick={() => onViewChange('home')}
          aria-label="Drumroll home"
        >
          <span className="arena-shell__brand-mark" aria-hidden="true">
            <img src={appIcon} alt="" />
          </span>
          <strong className="arena-shell__brand-name">Drumroll</strong>
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
        </nav>

        <div className="arena-shell__rail-foot">
          <div className="arena-shell__rail-utility">{settingsSlot}</div>
          <button
            type="button"
            className={cn(
              'arena-shell__profile',
              view === 'insights' && 'arena-shell__profile--active',
            )}
            data-testid="open-profile-button"
            title="Profile"
            aria-label="Open your profile"
            aria-current={view === 'insights' ? 'page' : undefined}
            onClick={onOpenProfile}
          >
            <FontAwesomeIcon icon={faUser} fixedWidth aria-hidden="true" />
            <span className="arena-shell__profile-label">Profile</span>
          </button>
        </div>
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
