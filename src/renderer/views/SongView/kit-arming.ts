/**
 * Starting a run from the laptop must not leave him walking to the stool
 * while the music plays. With a kit connected, the mouse ARMS the run and
 * the first strike starts it; pressing play again starts anyway, for the
 * times he is not going to the kit.
 */
export interface KitArmingInput {
  /** A MIDI kit is selected and actually connected. */
  kitConnected: boolean;
  /** Hands-free kit controls are switched on. */
  handsFreeControlsEnabled: boolean;
  /** The run is already armed and waiting for a strike. */
  alreadyArmed: boolean;
  /** An interrupted attempt is waiting to resume; it has its own prompt. */
  hasInterruptedAttempt: boolean;
}

export function shouldArmForKitStart({
  kitConnected,
  handsFreeControlsEnabled,
  alreadyArmed,
  hasInterruptedAttempt,
}: KitArmingInput): boolean {
  return (
    kitConnected &&
    handsFreeControlsEnabled &&
    !alreadyArmed &&
    !hasInterruptedAttempt
  );
}
