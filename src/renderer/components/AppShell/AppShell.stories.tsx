import type { Meta, StoryObj } from '@storybook/react';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import { AppShell, ArenaView } from './AppShell';

const meta: Meta<typeof AppShell> = {
  title: 'AppShell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof AppShell>;

const routeCopy: Record<ArenaView, { title: string; detail: string }> = {
  home: {
    title: 'Alternating Singles Warm-Up',
    detail: 'One kit, one next move.',
  },
  songs: {
    title: 'Your songs',
    detail: 'Practice-ready music on the same warm field.',
  },
  journey: {
    title: 'Your journey',
    detail: 'The next useful lesson stays obvious.',
  },
  insights: {
    title: 'Your profile',
    detail: 'Progress earned at the kit.',
  },
};

function RouteSurface({ view }: { view: ArenaView }) {
  const copy = routeCopy[view];

  return (
    <section
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: '3rem',
        color: view === 'home' ? 'var(--dr-studio-ink)' : 'var(--dr-ink)',
        backgroundImage:
          view === 'home'
            ? `linear-gradient(90deg, rgb(22 17 12 / 52%), transparent 66%), url(${homeKitStudio})`
            : undefined,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div style={{ maxWidth: '46rem', textAlign: 'center' }}>
        <p
          style={{
            margin: '0 0 0.75rem',
            fontSize: '1.1rem',
            fontWeight: 720,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {copy.detail}
        </p>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3.5rem, 7vw, 6.5rem)',
            lineHeight: 0.95,
          }}
        >
          {copy.title}
        </h1>
      </div>
    </section>
  );
}

function Harness({
  initialView,
  runOpen = false,
}: {
  initialView: ArenaView;
  runOpen?: boolean;
}) {
  const [view, setView] = useState<ArenaView>(initialView);

  return (
    <AppShell
      view={view}
      onViewChange={setView}
      settingsSlot={
        <button type="button" aria-label="Open settings">
          <FontAwesomeIcon icon={faGear} fixedWidth aria-hidden="true" />
        </button>
      }
      onOpenProfile={() => setView('insights')}
      runOpen={runOpen}
    >
      <RouteSurface view={view} />
    </AppShell>
  );
}

export const Home: Story = {
  render: () => <Harness initialView="home" />,
};

export const Songs: Story = {
  render: () => <Harness initialView="songs" />,
};

export const Journey: Story = {
  render: () => <Harness initialView="journey" />,
};

export const Profile: Story = {
  render: () => <Harness initialView="insights" />,
};

export const RunOverlay: Story = {
  render: () => <Harness initialView="songs" runOpen />,
};
