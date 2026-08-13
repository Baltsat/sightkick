# The one-minute kit test

Read this once, then run it at the kit any time you're not sure Drumroll can hear you. It answers the three things that have actually burned you: do my strikes arrive, do they land on the right drum, and do they get saved.

## Get there

1. Kit powered on, USB connected, DTX402 selected as your input.
2. Start any song or lesson in Practice mode.
3. On the practice screen, click the gear icon top-right — it's labeled **Inspector**.
4. Find the **Kit signal** box. Nothing in this box is guessed — it only shows what Drumroll actually received, when, and what it decided that meant.

## Check 1 — Do my strikes arrive at all?

Look at the box before hitting anything:

| You see                                        | Meaning                                     | What to do                                                                              |
| ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| **"Connected. Waiting for a hit."**            | Good — nothing has arrived yet, correctly.  | Go hit a pad.                                                                           |
| **"Not connected yet"**                        | Kit chosen, but the app never linked to it. | Check the USB cable and that the module is powered on, then press **Try reconnecting**. |
| **"No kit connected"**                         | Nothing is selected as input.               | Press **Choose your kit**.                                                              |
| **"Listening to your keyboard, not your kit"** | Input is set to the computer keyboard.      | Press **Switch to your kit**.                                                           |

Now hit any pad, hard enough to trigger a note, a few times.

- **Pass**: the small line at the bottom of the box (`raw hits …`) climbs with each hit. A real kit can send more than one signal per strike — don't expect it to climb by exactly one; just confirm it keeps moving.
- **Fail**: it stays put after several real hits, even though the box said "Connected." Likely cause: something else already has the MIDI port open (a DAW, a MIDI monitor) or a cable fault. Close other apps that touch the kit and press **Try reconnecting**.

## Check 2 — Is it landing on the right drum?

With the panel still open, hit each pad once, in a fixed order you can hold in your head: kick, snare, hi-hat, ride, crash, tom 1, tom 2, floor tom. After each hit, read the box before moving to the next pad.

- **Pass**: headline says **"Your kit is coming through"**, and the coloured dot + name match the pad you just hit — hit the snare, see "Snare."
- **Fail — unmapped**: headline says **"Arriving, but not mapped to a drum."** The signal is arriving but Drumroll doesn't know which lane it belongs to yet, so it will never count while you play. Press **Map this pad**, use **Learn** on the correct lane in the dialog that opens, then strike the same spot again to confirm.
- **Fail — wrong drum**: the name shown doesn't match what you hit (you hit the ride, it says "Crash"). The app can only report the lane it decided, not whether that matches your intent — that comparison is yours to make, which is why you hit pads in a known order. Fix it the same way: **Map this pad** → **Learn** the right lane on the right pad.

A pad with more than one playable zone (hi-hat open vs. closed, a cymbal's edge vs. bow) can need each zone Learned on its own — the box only tells you about the spot you just struck.

## Check 3 — Is it being saved into the run?

Checks 1 and 2 prove Drumroll hears you live. They don't prove a finished run gets saved — for that:

1. Close the Inspector and play a short song or lesson through to the end (a few bars is enough).
2. When it finishes, a result screen should appear with real numbers on it.

- **Pass**: the result screen appears, and its numbers plainly reflect what you played — not zero, not obviously wrong for how long or how well you played.
- **Fail**: no result screen appears, or it shows all zeros despite Checks 1 and 2 both passing. That's a save problem, not an input problem — worth reporting with the song/lesson name and roughly how long you played.

## If you already know the app

Inspector → Kit signal → hit each drum once in playing order, confirming name and colour each time → play one short song to the end → confirm the result screen shows real numbers. Under a minute.
