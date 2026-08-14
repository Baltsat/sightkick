import { ReactNode, useEffect } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useInput } from '../../context/InputContext';
import type { InputDevice } from '../../input';
import { KitSignalCheck } from './KitSignalCheck';

const noop = () => {};

function withLayout(): Decorator {
  return (Story) => (
    <div className="p-6">
      <div className="border border-border rounded-xl shadow-panel bg-bg p-3 min-w-90 w-max">
        <Story />
      </div>
    </div>
  );
}

// `InputProvider` lives in the global Storybook decorator (see
// .storybook/preview.tsx), one render pass above anything a per-story
// decorator can seed via localStorage before it first mounts. Selecting the
// device through the same public `setSelectedDevice` the real Settings UI
// uses avoids that race entirely, at the cost of one extra render. Each
// story below owns exactly one of these — stacking one on top of the meta
// default would just have the two effects fight over the final value.
function withDevice(device: InputDevice | null): Decorator {
  function SeedDevice({ children }: { children: ReactNode }) {
    const { setSelectedDevice } = useInput();

    useEffect(() => {
      setSelectedDevice(device);
      // Seed once per story mount — the real Settings UI drives this state
      // afterward through user action, which the story does not simulate.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <>{children}</>;
  }

  return (Story) => (
    <SeedDevice>
      <Story />
    </SeedDevice>
  );
}

const meta: Meta<typeof KitSignalCheck> = {
  title: 'Settings/Kit Signal Check',
  component: KitSignalCheck,
  args: { onSetupInput: noop },
  decorators: [withLayout()],
};

export default meta;

type Story = StoryObj<typeof KitSignalCheck>;

// No device chosen at all — the honest starting state for a fresh profile.
export const NoDevice: Story = {
  decorators: [withDevice(null)],
};

// A player testing without a kit plugged in: input works, but it is not the
// DTX, so nothing struck on the pads can arrive this way.
export const ListeningToKeyboard: Story = {
  decorators: [
    withDevice({ id: 'keyboard', name: 'Keyboard', sourceId: 'keyboard' }),
  ],
};

// The kit is the remembered device, but Drumroll has not completed the port
// handshake yet — the state a player would see the instant the module is
// unplugged, off, or still waking up.
export const NotConnectedYet: Story = {
  decorators: [
    withDevice({
      id: 'midi:Yamaha DTX402',
      name: 'Yamaha DTX402',
      sourceId: 'midi',
      port: 4,
    }),
  ],
};
