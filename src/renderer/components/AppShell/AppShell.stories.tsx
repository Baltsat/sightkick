import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { AppShell, ArenaView } from './AppShell';
// QA-only: demonstrates the kit-continuity contract (`--dr-home-field-crop`,
// documented in AppShell.css) being satisfied by a publisher. Reading this
// asset does not modify HomeCockpit — it is the same photograph the other
// lane already ships, used here only to prove the shell's bleed layer reads
// whatever crop lands on `--dr-home-field-crop`.
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';

const meta: Meta<typeof AppShell> = {
  title: 'AppShell/AppShell',
  component: AppShell,
};

export default meta;

type Story = StoryObj<typeof AppShell>;

function Harness({
  initialView,
  crop,
}: {
  initialView: ArenaView;
  crop?: string;
}) {
  const [view, setView] = useState<ArenaView>(initialView);

  return (
    <div
      style={
        {
          height: '100vh',
          // Simulates the one-line contract: whoever wires the home route
          // publishes `--dr-home-field-crop` on an ancestor while the kit
          // photo is showing. AppShell never imports this asset itself.
          ...(crop ? { '--dr-home-field-crop': `url(${crop})` } : {}),
        } as CSSProperties
      }
    >
      <AppShell
        view={view}
        onViewChange={setView}
        settingsSlot={<span>⚙︎</span>}
        onOpenProfile={() => setView('insights')}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: crop ? `url(${crop})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: 'var(--dr-canvas)',
          }}
        />
      </AppShell>
    </div>
  );
}

/** The handoff satisfied: a crop is published, the rail's right edge is
 * transparent, and the kit photo bleeds under the rail before dissolving
 * into the ambient field — no hard seam at the panel boundary. */
export const HomeWithPublishedCrop: Story = {
  render: () => <Harness initialView="home" crop={homeKitStudio} />,
};

/** The safe fallback: no crop published yet. Pixel-identical to the plain
 * rail — `background-image: none` paints nothing regardless of opacity. */
export const HomeWithoutPublishedCrop: Story = {
  render: () => <Harness initialView="home" />,
};

/** Every other route: the rail keeps its ordinary hairline border, and the
 * bleed layer stays invisible even if a crop happens to still be set. */
export const SongsRouteBorderRestored: Story = {
  render: () => <Harness initialView="songs" crop={homeKitStudio} />,
};
