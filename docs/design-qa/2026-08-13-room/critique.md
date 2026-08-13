# kb.13 room pass — do the last five items hold?

Captures reviewed: `docs/design-qa/2026-08-13-room/*.png` (1225×768 and 1024×700) beside `docs/design-qa/2026-08-12-yandex-reference/`, `docs/design-acceptance-notes.md`, `docs/visual-system-v3.md`, and my own prior verdict at `docs/design-qa/2026-08-13-truth/critique.md`. Cross-checked against source: `HomeCockpit/KitHome.css`, `HomeCockpit/kit-zone-map.ts`, `LessonsView.tsx`, `LessonsJourney/JourneyV2.css`. Songs (`02-library-*.png`) and Result (`05-result-*.png`) are byte-identical to the prior pass (verified by hash) — this round touched only home and journey, plus an incidental change to practice notation spacing. I judge only what moved.

**Scoreboard on the five open items: 3 fixed, 2 partly. Nothing regressed. One pre-existing bug noticed for the first time, not caused by this round.**

---

## Screen by screen: place or report?

- **Home — a place now, with one hole in it.** The hero collapsed from a four-line stack to one huge line (`Alternating Singles Warm-Up`) with a small kicker (`LESSON 01.01`) above it — this is the first home capture in the set that actually resembles `My Vibe`'s one-word confidence instead of a caption glued to a photo. The kit is unbroken edge to edge; the manifest text and the low shelf now sit in text-safe bands that are _measured off the strike-zone map itself_ (`KitHome.css:7-14`, `kit-text-safe-bands.ts`), not eyeballed — so nothing paints over a pad by construction, not by luck. Seven of eight strike zones read as lit drum surfaces (kick, snare, floor-tom, crash, ride, tom2, and now hi-hat). A drummer sitting down would read six-plus pads at a glance and reach for them. He'd still hesitate on tom1: see item 3.
- **Songs — unchanged, still the cleanest screen in the set.** Byte-identical to the prior pass. A library, not an admin table. Nothing to add or subtract.
- **Journey — a place, and the last visible gap in it just closed.** Season rail now shows full names at 1024×700 (`02 Rudiment Gym I: Sticking Foundations`, wrapped across two lines) instead of the ellipsis-truncated `02 Rudiment Gym I: Sticki…` from the prior pass. One caption, real lock glyphs, a real controls button — still reads as a rehearsal room with drums scattered on a floor and a path between them, not a curriculum spreadsheet. New minor finding below (not caused by this round).
- **Practice — unchanged in grammar, incidentally denser.** Transport line, notation, and caption are pixel-for-pixel the same pattern as the already-passing prior state. The one visible difference: the active-bar highlight band grew from ending around y≈590 to ending around y≈695 (out of 768) — roughly 100px, about three-quarters of the previously-flagged "bare paper below the highlight" is gone. Nobody asked for this in this round; it's a side effect of a `ContinuousNotation.css` touch that also reduced how many beats fit on screen (4 visible in the prior capture, 3 now, wider spacing per beat). Not a regression — still fully readable — just worth naming since it wasn't requested.
- **Result — unchanged, still the model screen.** Byte-identical to the prior pass.

---

## The five open items

1. **Home: manifest flap covering the hi-hat, hero title covering the crash — FIXED.** Both text bands are now derived from `computeKitTextSafeBands`, which reads `HOME_KIT_ZONE_MAP` directly (`KitHome.css:7-14`, comment cites this exact critique by name). Visually confirmed at both widths: the title band ends well above the crash ring's top edge (clean gap, no overlap), and the shelf/`Start practice` band now sits at the very bottom of the frame near the rug, nowhere near the hi-hat's position mid-kit. Neither of the two zones the last critique named as physically covered is covered now.

2. **Home: hero title still four lines fighting the photograph — FIXED.** One line, `Alternating Singles Warm-Up`, with `LESSON 01.01` as a small kicker above it, at both 1225×768 and 1024×700. This is the first capture that reads like `My Vibe`'s single confident word rather than a caption card. `KitHome.css:97-106` sizes the line off the measured safe-band height, not a hand-picked clamp, with `-webkit-line-clamp: 2` as a backstop for an unusually long name — today's title uses one.

3. **Home: hi-hat/tom1 (yellow) zone bare and unfilled — PARTLY, and the partial half is worse than it looks.** The physical hi-hat cymbals (bottom-left) now carry a real gold wash across the whole surface — genuinely fixed, matches the treatment already visible on kick/snare/crash/floor-tom. But **tom1** (the upper-middle drum head, the yellow lane's other zone per `kit-zone-map.ts:44-49`) is pixel-for-pixel the same bare thin ring it was in the prior capture — no wash, no visible fill, at both widths. Direct side-by-side crop at 1225×768 (`tom1` vs the adjacent `tom2`, same drumhead material, same lighting, same code path via `data-color-lane`) shows tom2's head clearly blue-tinted and tom1's head plain cream with only a thin gold border. `KitHome.css:225-333`'s own comment explains why: the fix (74% vividness floor + a black contrast ring) was reasoned specifically against "hi-hat/tom1 on **brass**" — but tom1 doesn't sit on brass, it sits on its own **cream drumhead**, which is exactly as close in hue/lightness to a translucent yellow wash as brass is. The fix solved the case they wrote the comment about (hi-hat on metal) and left an equivalent, undocumented case (tom1 on cream) exactly as broken as before. One of eight zones is still a diagram outline instead of light on a drum.

4. **Journey: season rail loses names or truncates them at 1024×700 — FIXED.** Full names now render and wrap (`02 Rudiment Gym I: Sticking Foundations` across two lines) instead of truncating mid-word with no escape hatch. Confirmed at 1024×700; no ellipsis, no `title`-tooltip workaround needed because the text isn't being cut anymore.

5. **Practice: bare paper below the active-bar highlight — PARTLY (unrequested, incidental).** The highlighted band now reaches roughly y≈695 instead of y≈590 out of a 768px-tall capture — most of the previously-bare strip is gone. This wasn't asked for this round and its cause (a `ContinuousNotation.css` change made in the same batch) also changed beat spacing (fewer beats visible per screen at the same zoom). Still legible, still correct — just noting it moved without being on anyone's list.

---

## What the changes broke

**Nothing regressed.** Songs and Result are byte-identical to the prior pass. Home's title-safe and action-safe bands are now derived geometrically from the zone map, which is a more robust fix than a one-off nudge — it shouldn't reopen the "text over a pad" class of bug the way the last round's `flex-start` change did. Practice's spacing change is a side effect, not a regression — nothing there lost readability.

**One pre-existing bug, noticed now, not caused by this round.** The `journey-venue-plaque` badge (top-right of the journey stage: `SEASON 01 / Foundations / CURRENT STAGE`) renders a stray ellipsis after "Foundations" even though the word is nowhere near its own box's width — confirmed present, identically, in both the prior (`2026-08-13-truth`) and current (`2026-08-13-room`) captures at 1225×768, so today's work didn't cause it. `JourneyV2.css:333-342`: `.journey-venue-plaque strong` uses `max-width: min(16rem, 34%)` with `text-overflow: ellipsis; white-space: nowrap` — the box is sized tight enough that an 11-character word trips the same truncation logic the rail just got fixed for, in a second spot nobody checked. Low severity (the ellipsis is nearly invisible against the studio photo), but it's the same box-sizing carelessness recurring right next to the fix that was supposed to retire it.

---

## Counts

Against the five items from the prior critique: **3 fixed** (1, 2, 4), **2 partly** (3, 5), **0 still broken**.

## Ranked, most severe first, of everything still wrong

1. **Home: tom1's yellow strike zone is still a bare, unfilled ring** (`01-home-*.png`, both widths) — the sibling hi-hat zone in the same colour lane got fixed; tom1 didn't, because the fix's own reasoning (contrast against brass) doesn't transfer to tom1's actual backdrop (its own cream drumhead). One of eight zones remains a diagram, not light on a drum.
2. **Journey: the venue-plaque badge clips "Foundations" with a stray, nearly-invisible ellipsis it doesn't need** (`03-journey-1225x768.png`, top-right badge) — pre-existing, not caused by today's changes, low visual severity, but the same truncation-box mistake the rail fix next to it just eliminated.
3. **Practice: beat spacing widened as a side effect of the same-round highlight-band change, fitting fewer beats per screen** (`04-practice-*.png`) — not broken, not requested, worth a deliberate look rather than leaving as a byproduct.

Nothing above is a truthfulness violation or a physically-covered strike zone — both of those closed this round. What's left is one pad that still reads flat next to seven that now read lit, and a cosmetic label bug one screen over that was always there.
