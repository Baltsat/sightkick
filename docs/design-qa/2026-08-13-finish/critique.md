# kb.12 finish critique — place or report?

Captures reviewed: `docs/design-qa/2026-08-13-finish/*.png` (1225×768 and 1024×700) against `docs/design-acceptance-notes.md`, `docs/visual-system-v3.md`, and the live Yandex captures in `docs/design-qa/2026-08-12-yandex-reference/`. No praise, no hedging. Findings are ranked most-severe first inside each screen, then an overall ranked list closes the doc.

---

## Home (`01-home-1225x768.png`, `01-home-1024x700.png`)

**Verdict: report, not a place.** The kit finally bleeds to the edge — that part is fixed — but the manifest above it is lying to itself, and the vertical rhythm is dead again.

1. **The manifest contradicts its own state.** The hero title reads a specific armed lesson — "Lesson 01.01 — Alternating Singles Warm-Up" — with a live "Start practice" button under it. The line directly beneath says "Choose a song to begin / Pick a song, then strike a highlighted drum to start." One is armed-state copy, the other is idle-state copy, on the same screen at the same time. He will read this and not know if a song is loaded. This is exactly the "nothing on screen may be wrong" rule from the acceptance notes — a copy state that isn't even internally consistent is worse than a wrong number, because it can't be checked against data at all.
2. **XP is still in the first viewport, just smaller.** "No active streak · Today 0/50 XP · View profile" sits directly under the manifest. The 2026-08-12 rejection said the XP chip must not compete with the hero; the fix moved it from a top-right badge into inline body text, but it is still an unearned counter shown before anything is played, which `fidelity-closure-order-20260812.md` (G03) explicitly says to remove from first view until one evidence source drives it. Moving furniture to a quieter font is not removing it.
3. **The column is dead again.** Between "Start practice" (top) and "Session details / No active streak" (bottom) there is roughly 350px of pure gap in the 1225×768 capture — the same "tall empty gap... leftover, not deliberate" defect named in the 2026-08-12 verdict, item 6. The spec's fix for this exact gap was a one-line low shelf showing next lesson, last musical win, and daily commitment (visual-system-v3.md, "home — the personal kit"). That shelf does not exist on this screen at all — the next-song "footnote" from the old verdict wasn't fixed, it was deleted, and the empty space it left behind was never refilled.
4. **Strike zones are thin rings, not light on a drum.** Every pad is a 2px coloured outline with no fill and no glow — kick is a dim red circle on a near-black drumhead, the two toms in shadow (upper-left, lower-right) are barely distinguishable from unlit metal at this brightness. This is closer to "faded to nearly invisible" (2026-08-12 verdict, item 3) than to "unmistakable at two metres." Held at arm's length on a laptop at the kit, the yellow ring on the yellow-lit tom and the tan ring on the beige floor tom will disappear into the photograph.
5. **Title still doesn't get the "one huge title" treatment.** Four lines at a modest weight, sharing the top of the frame with the rail label and the drums behind it. `My Vibe` spends the whole left two-thirds of the frame on one word at enormous size; here the title is competing for space with the photograph starting at line one. It reads as a caption over a photo, not the identity of the room.

---

## Songs / Library (`02-library-1225x768.png`, `02-library-1024x700.png`)

**Verdict: an admin table with rounded thumbnails, not a library.** This is the single worst screen in the set.

1. **Every row carries two buttons and a status line — the exact pattern the spec forbids.** "Needs proof · local audio + reviewed chart" plus a "Check charts" button plus a "Use local audio" button, repeated identically on all seven visible rows. `visual-system-v3.md` is explicit: a row gets "one right-side play/continue affordance," and "imports, chart provenance, split progress, local/remote technical state... fall behind an `add music` sheet. They are operational tools, not the visual start point." This screen puts the operational tools directly in the first viewport, on every row, with no exceptions visible.
2. **The header claims are contradicted by the first screen of rows.** "170 ready to play" sits at the top, then every one of the first 7 rows (sorted by the default "Difficulty" chip) reads "Needs proof." If 170 songs are playable, none of them sorts to the top by default. He opens his library and the first thing he sees is a wall of songs he cannot play yet.
3. **"Navigation unavailable · Set library controls in Configure input" is raw engineering text in the primary view.** This is a debug/config string, not product copy — it belongs in a settings panel, not sitting permanently under the filter chips of the main library route. This is the single clearest violation of "plain human copy, never engineer jargon" on the entire capture set.
4. **Density is otherwise correct and should be kept.** Thumbnail, title, one support line, flat rows on paper with hairlines — this part matches the reference grammar. Don't touch the row shell; gut the right edge.

---

## Journey (`03-journey-1225x768.png`, `03-journey-1024x700.png`)

**Verdict: closer to a place, but the map still argues with itself.**

1. **Four caption cards float over the scene permanently — a second dashboard inside the map.** "NEXT UP," and three "LOCKED" callouts ("Paired Doubles Warm-Up," "Kick Drum Pulse," "Whole and Half Note Reading") are all visible at once, unprompted. `visual-system-v3.md` is explicit: "Stars, lock metadata, detailed curriculum facts, and controls reveal on focus/selection" — not permanently rendered. Right now the studio image is 40% obscured by stacked information cards, which is precisely the "second curriculum dashboard inside the map" the doc calls a forbidden rival.
2. **At 1024×700 the season rail loses its names entirely.** The left list collapses to bare numbers with a small dot ("01," "02," "03"…) and no visible label — not even a tooltip affordance. The spec requires "full season names and clear next/locked/cleared states" in the rail; at the compact width, which is closer to his real laptop-at-the-kit size, he cannot tell what any season is called without hovering blind.
3. **"Controls" sits alone, unstyled, bottom-right of the image.** No icon, no button chrome, no visible state — it reads like leftover debug text, not a control.
4. **The two-column header (season identity left, next-lesson-plus-Start right) is a reasonable compromise and should stay** — it is one action, one target, doesn't rival the map. Keep it; fix the floating card clutter underneath it.

---

## Practice (`04-practice-1225x768.png`, `04-practice-1024x700.png`)

**Verdict: closest to passing. Score owns the room; the transport line is honest. Two real defects remain.**

1. **At 1024×700, mode and speed vanish from the transport line.** Wide capture reads "Practice · flow · 0.7x · Keyboard"; compact reads "Practice · Keyboard." He loses the read on what speed he's practicing at, at the width he'll actually run this on. The acceptance bar says he must "name the current target and the one next action in under two seconds on every route" — that includes knowing his own tempo.
2. **The subtitle line truncates mid-word at both widths:** "My Wave · Play a short phrase so your next les…" / "My Wave · Play a short phras…". A truncated sentence that cuts inside a word reads as broken, not as an intentional ellipsis. Either shorten the copy so it fits the safe width or truncate at a word boundary.
3. **The staff sits small in a very large empty canvas** — roughly two-thirds of the vertical space above and below the four visible bars is bare paper. This isn't the leftover-gap defect from home (there's no orphaned control nearby), but it doesn't read as "the score owns the room" either; it reads as a small object placed in a big empty room. Worth a pass once the transport-line fixes land, not urgent today.

---

## Result (`05-result-1225x768.png`, `05-result-1024x700.png`)

**Verdict: the receipt is a chart wall wearing a paper coat, and it says something false.**

1. **"Nice reps" sits above 0% accuracy on every scored lane.** Hi-Hat "0% (4)," Snare "0% (128)" — zero hits recorded, out of 128 attempts on snare alone — under a headline that reads as praise. This is the exact class of defect the acceptance notes call a P0: "a number that contradicts the stored data." Here the copy contradicts the number on the same screen. If 0% is real, "Nice reps" is a lie he will catch on the first real run; if 0% is a wiring bug (telemetry not reaching the receipt, matching the class of defect already logged in `bug-hunt-20260812.md`), then the whole receipt is unverified and should not ship gated behind "done."
2. **The receipt is a stacked card deck, not one musical statement.** In order: a "RUN COMPLETE" eyebrow, a title, a difficulty tag, a tinted "WHAT CHANGED" box, a "Nice reps" headline, a second tinted "ONE MORE LEARNING PASS" box, then a full "ACCURACY PER DRUM" table with at least seven rows (Hi-Hat, Ride, Crash, Snare, Tom 1, Tom 2, Tom 3, more below the fold). `visual-system-v3.md` caps a receipt at "at most three factual cells" with charts nested behind an explicit "see the evidence" action. This screen shows the chart by default, uncollapsed, as the majority of the visible content.
3. **The one continuation action is off-screen in both captured sizes.** Neither 1225×768 nor 1024×700 shows a visible button — the capture ends mid-table ("Tom 1: No hits yet" clipped at the very bottom edge in the compact shot). A receipt whose one required action ("continue my wave" or equivalent) isn't visible without scrolling fails "one strong line and one continuation action" outright.
4. **It renders as a centered white modal with a shadow over a dimmed practice screen** — a card floating on a card, which is the "glass card... over the score" pattern the doc lists under patterns that must die, even though the shadow here is on paper rather than glass.
5. **"Drumroll Method · expert"** under lesson 01.01 — the very first lesson in Foundations — reads as wrong at a glance. If "expert" refers to something other than player skill level (arrangement source, notation authoring tier), the label needs a word that doesn't imply he's being told a warm-up drill is expert-difficulty; if it does mean skill level, it's a data bug.

---

## Ranked list of failures (most severe first)

1. **Result: "Nice reps" headline paired with 0% accuracy on every drum lane** (`05-result-*.png`) — a truthfulness failure on the exact screen meant to close the trust loop after a run.
2. **Songs: every row carries "Needs proof" plus two technical buttons, contradicting the "170 ready to play" header** (`02-library-*.png`) — the library reads as blocked/administrative on first open, not as a place to pick something to play.
3. **Songs: "Navigation unavailable · Set library controls in Configure input" is raw engineering text in the primary view** (`02-library-*.png`).
4. **Result: receipt is an uncollapsed accuracy table (7+ rows) plus three stacked callout boxes, with the one continuation action scrolled off-screen at both captured widths** (`05-result-*.png`).
5. **Home: hero title (armed-lesson copy) directly contradicts the manifest line beneath it (idle "choose a song" copy)** (`01-home-*.png`) — an internal consistency failure, not just a hierarchy one.
6. **Home: XP/streak line still occupies the first viewport** (`01-home-*.png`) — moved to quieter type, not removed, contrary to the closure order's explicit instruction.
7. **Journey: four lock/next captions float permanently over the map instead of on focus/selection** (`03-journey-*.png`) — a second dashboard inside the scene.
8. **Home: ~350px dead gap between the start button and the session-details line, with no low shelf (next lesson / last win / streak) ever placed there** (`01-home-*.png`) — the same defect named in the prior rejection, now with its intended fix simply absent.
9. **Journey: season rail loses all names at 1024×700, showing bare numbers with no label** (`03-journey-1024x700.png`).
10. **Practice: mode and speed (`flow · 0.7x`) disappear from the transport line at 1024×700** (`04-practice-1024x700.png`).
11. **Home: kit strike-zone rings are thin, unfilled outlines that fade into the photograph in low-lit areas** (`01-home-*.png`) — not yet "unmistakable at two metres."
12. **Practice: subtitle truncates mid-word at both widths** (`04-practice-*.png`).
13. **Result: modal-on-dimmed-backdrop-with-shadow composition** (`05-result-*.png`) — card-over-card, contrary to the flat-surface rule.
14. **Result: "expert" difficulty tag on the very first lesson reads as wrong or unexplained** (`05-result-*.png`).
15. **Journey: orphaned "Controls" text, bottom-right of the map image, with no visible affordance** (`03-journey-*.png`).
16. **Home: hero title still four lines, sharing top-of-frame space with the photograph rather than owning it the way `My Vibe` owns its frame** (`01-home-*.png`).
17. **Practice: staff occupies roughly a third of the vertical canvas, with the rest bare paper** (`04-practice-*.png`) — the score doesn't yet "own the room," it sits in one.

Nothing in this set passes outright. Songs and Result are not close; Home is close on the kit-bleed and audio far on the manifest and rhythm; Journey and Practice are the nearest to done and need the fewest changes.
