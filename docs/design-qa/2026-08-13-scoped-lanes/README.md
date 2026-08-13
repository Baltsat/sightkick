# Visual proof — Journey / ScoreSummary / Profile lane, 2026-08-13

Scope: `src/renderer/components/LessonsJourney/**`, `LessonsView/**`,
`ScoreSummary/**`, `Profile/**`. Captured against local Storybook
(`corepack yarn storybook -p 6100`), not the built app — this checkout has
four other lanes editing in parallel, so this avoids touching the shared
`out/` build. See `capture-scoped-lanes.mjs` for the exact story IDs and
interactions.

## 1–2. Journey on the shared field (design-acceptance-notes.md item 1)

`01-journey-1225x768.png`, `02-journey-1024x700.png` — the season rail, path,
and node plaques now sit directly on warm paper instead of the retired
`journey-studio.png` dark-room backdrop. `journey-studio.png` is no longer
imported anywhere in `src/`.

## 3–4. Result screen (items 1, 4)

`03-result-worst-case-1024x700.png` — every optional footer row at once
(saving banner, auto-continue countdown, three hands-free kit prompts,
postcard export) still leaves the primary continuation action fully visible
with no outer scroll, because `.drumroll-score-summary__body` scrolls
internally while header/footer stay pinned.

`04-result-musical-receipt-1225x768.png` — the receipt leads with the
musical statement ("Kick rose 20 points") before XP/streak/achievement
material, and now sits on the same warm-paper/ember field gradient as every
other route (`ScoreSummary.css` replicates `AppShell.css`'s default
`::before` gradient, since the receipt portals to `document.body` outside
the shell's own DOM subtree).

`musicalReceipt.ts` also gained a speed-comparability guard: an accuracy or
timing "improvement" is no longer claimed when the current pass was played
at a slower speed than the one it's compared against, since a slower pass
lands more notes on its own. See `musicalReceipt.test.ts`.

## 5–8. Profile — full screen, one time scale (item 2)

`05-profile-today-1225x768.png`, `06-profile-30d-1225x768.png`,
`07-profile-history-1225x768.png`, `08-profile-today-1024x700.png` — the
insights hero (current target, streak/stars/achievements) stays persistent
above a `Today / Last 30 days / All history` segmented control; exactly one
scale's content is mounted at a time (`ProfileView.test.tsx` asserts this).
Today carries the recommendation, today's practice cards, the skill spine,
and due reviews; 30 days carries per-drum accuracy, deadline pacing, and the
weekly rhythm/recap (each self-labelled "this week", never claimed as a
30-day figure); History carries the goal card, mastery graph, evidence
archive, and retired-lesson history. The route uses the full window instead
of the old ~1200px centred scrolling column.

`GoalCard`'s mastery ring/graph shows Storybook's loading spinner in
`07-profile-history-1225x768.png` — that's `useMastery`'s IPC round trip
never resolving under the Storybook `once()` mock
(`.storybook/preview.tsx`), not a defect in this lane's code;
`ProfileView.test.tsx` exercises the loaded state directly via IPC mocks.
