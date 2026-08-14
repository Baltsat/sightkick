# Design acceptance notes — the bar I hold as product owner

Written by the root agent after looking at the installed build beside the live Yandex Music capture set in `design-qa/2026-08-12-yandex-reference/`. These are rejection criteria, not suggestions. A surface that fails any of them is not done.

## Verdict on the kb.12 home (`design-qa/2026-08-12-installed-verify/02-installed-home.jpg`)

Rejected. It is a dashboard with a photograph inside it, not a room the player sits in.

1. **The kit is a card, not the field.** It sits in the right third with rounded corners and a page gap. In `My Vibe` the artwork _is_ the surface — it bleeds, and the type sits on it. Our kit must own the canvas edge to edge; the rail and the text live on the same field, not beside a framed image.
2. **The title is squeezed.** "Lesson 01.01 — Alternating Singles Warm-Up" wraps five times in a narrow middle column. `My Vibe` spends one huge, confident title per screen. Ours must be large enough to read as the identity of the moment, with room to breathe.
3. **The strike zones have faded to nearly invisible.** The colour mapping is the learning device he memorises the kit by; it must be unmistakable at a glance from two metres away at the kit, while still looking like light on a drum rather than stickers.
4. **The XP chip is a status bar.** It floats top-right, shows a wrong number, and competes with the hero. Progress belongs where it is earned, quiet until it means something.
5. **The next song is a footnote.** "Boulevard of Broken Drea…" is truncated in small type at the bottom of a column. It is his musical payoff — the reason to practice — and must read as a real, low shelf on the same field.
6. **The column rhythm is dead.** A tall empty gap sits between the start button and the bottom item. Empty space must be deliberate, not leftover.

## Standing rules

- **One dominant object per screen.** On home that is the kit. Nothing else may rival it — no second hero, no XP panel, no permanent coach deck.
- **The field is continuous.** Warm paper for choosing, planning and reflecting; studio dusk for the live kit and notation. Never a white card on a beige page inside another card.
- **Emphasis is spent once.** Saturated colour means one thing: the action that starts playing. Kit colours identify drums. Nothing else earns saturation.
- **Detail is reachable, never preloaded.** Telemetry, history, settings and rationale are one intentional action away, never in the first viewport while the kit is asking for a hit.
- **Motion must mean something.** It marks a real event — a strike, a beat, a state change. Decorative motion is a defect.
- **Nothing on screen may be wrong.** A number that contradicts the stored data is a P0, not a polish item. Check every readout against real values, including the boundaries.
- **He must know why to hit where.** Notation, kit colour, and explanation form one system; a symbol he cannot decode is a failure of the product, not of the player.

## How to judge before declaring done

Put the capture beside `design-qa/2026-08-12-yandex-reference/00-initial-home.png` and ask: does mine look like a place, or like a report about a place? If a stranger saw both, would they believe the same team made them? If the answer is no, keep working.
