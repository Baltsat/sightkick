import type { Meta, StoryObj } from '@storybook/react';
import {
  NotationGlossary,
  NotationKitKey,
  NotationKind,
  shouldShowNotationKitKey,
  useNotationGlossaryIntent,
} from './NotationGlossary';

function GlossaryDemo({ pinnedKind }: { pinnedKind?: NotationKind }) {
  const glossary = useNotationGlossaryIntent();
  const intent = pinnedKind
    ? { kind: pinnedKind, x: 430, y: 250 }
    : glossary.intent;

  return (
    <main
      onPointerLeave={glossary.dismiss}
      onPointerDown={(event) => {
        if (event.altKey) {
          glossary.summon(event.target, event.clientX, event.clientY);
        }
      }}
      style={{
        minHeight: '100vh',
        padding: '12vh 10vw',
        background: '#f7f0e5',
        color: '#2c2824',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#b65338',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
        }}
      >
        notation guide
      </p>
      <h1 style={{ margin: '8px 0 18px', fontFamily: 'var(--font-display)' }}>
        option-click a mark
      </h1>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          width: 'fit-content',
          padding: 32,
          border: '1px solid #e2c8a9',
          borderRadius: 18,
          background: '#fffaf2',
          fontSize: 50,
        }}
      >
        <span data-notation-kind="dot" style={{ cursor: 'help' }}>
          ♩.
        </span>
        <span data-notation-kind="triple-beam" style={{ cursor: 'help' }}>
          ♬
        </span>
        <span data-notation-kind="accent" style={{ cursor: 'help' }}>
          &gt;
        </span>
        <span
          data-notation-kind="colored-head"
          style={{ color: '#d95b39', cursor: 'help' }}
        >
          ●
        </span>
      </div>
      <p style={{ maxWidth: 440, color: '#6d6258', lineHeight: 1.55 }}>
        option-click an element to see its plain-language musical meaning.
      </p>
      <NotationGlossary intent={intent} />
    </main>
  );
}

const meta: Meta<typeof GlossaryDemo> = {
  title: 'Song View/Notation Glossary',
  component: GlossaryDemo,
};

export default meta;

type Story = StoryObj<typeof GlossaryDemo>;

export const DeliberateInspect: Story = {};

export const VisibleTripleBeam: Story = {
  args: { pinnedKind: 'triple-beam' },
};

function KitKeyDemo({
  interactionMode,
  manualVisible = false,
  presentationPhase,
}: {
  interactionMode: 'kit' | 'computer';
  manualVisible?: boolean;
  presentationPhase:
    | 'ready'
    | 'counting-in'
    | 'playing'
    | 'paused'
    | 'inactivity-paused'
    | 'recovery-explain'
    | 'result';
}) {
  const visible = shouldShowNotationKitKey({
    interactionMode,
    manualVisible,
    presentationPhase,
  });

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100vh',
        padding: '6vh 8vw',
        background: '#24201b',
        color: '#fffdf8',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p>score {presentationPhase}</p>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>read the next hit</h1>
      <p>{visible ? 'kit key visible' : 'kit key hidden'}</p>
      {visible && <NotationKitKey layout="flow" />}
    </main>
  );
}

export const KitKeyPaused: StoryObj<typeof KitKeyDemo> = {
  render: () => <KitKeyDemo interactionMode="kit" presentationPhase="paused" />,
};

export const KitKeyComputerMode: StoryObj<typeof KitKeyDemo> = {
  render: () => (
    <KitKeyDemo interactionMode="computer" presentationPhase="playing" />
  ),
};

export const KitKeyPlayingHidden: StoryObj<typeof KitKeyDemo> = {
  render: () => (
    <KitKeyDemo interactionMode="kit" presentationPhase="playing" />
  ),
};

export const KitKeyManualToggle: StoryObj<typeof KitKeyDemo> = {
  render: () => (
    <KitKeyDemo
      interactionMode="kit"
      manualVisible
      presentationPhase="playing"
    />
  ),
};
