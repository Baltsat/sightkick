# Drumroll 1.2.0-kb.15

`kb.15` is prepared here, not published. This draft covers release source
through `ac6f199`; it deliberately excludes the active uncommitted
automatic-import/search lane and has no DMG or public release yet.

## the kit is the starting point

- Home is now a labelled drum-kit launcher. Kick continues, snare starts My
  Wave, hi-hat opens the next lesson, ride opens songs, crash opens discovery,
  and the toms hold the most-played songs.
- A physical hit selects a door; the confirm control starts it. A stray strike
  does not start a session.
- Home says whether the kit is connected, reconnecting, or absent.
- Opening Configure Input pauses practice before Learn takes ownership of a
  live strike.
- Inactivity parking pauses and seeks without tearing down MIDI while Drumroll
  waits for the resume strike.
- Count-ins render every beat in five-, six-, and seven-beat measures.
- Archive and streak credit now use the player's local day.

## My Wave lives on the snare

- My Wave leaves the rail and becomes the snare's direct action.
- Selection balances musical fit with affection: saved favourites and songs
  replayed often matter inside the current practice zone.
- A beloved song that is too far ahead cannot displace a useful next exercise.
- The reason for a recommendation carries its musical similarity, difficulty
  step, and preference evidence.

## one living field

- Home, songs, Journey, practice, result, and statistics now sit on the same
  warm paper-and-ember field.
- The rail stays in place while routes change; reduced motion preserves state
  without the route animation.
- Songs use one honest shelf with real difficulty data. A chart that did not
  parse does not receive an invented rating or a false Play action.
- Statistics uses the full window and one time range at a time.
- Missing artwork uses a neutral placeholder rather than the Drumroll mark.

## the score teaches the kit

- Practice noteheads carry their drum lane colour, while position and shape
  keep the score readable without colour alone.
- The kit key starts closed and opens from a quiet toolbar action when wanted.
  Its open/closed state persists.
- Repeated figures read as repeats.
- A missed note keeps its lane colour and dims rather than becoming a generic
  red warning.
- Why is a deliberate action. It stays inside the window, does not cover the
  note it explains, and gives the expected drum, actual drum, and a concrete
  correction.

## proof included in source

- Home door routing and deliberate confirm behavior: `HomeCockpit.test.tsx`,
  `kit-door-routing.test.tsx`, and
  [`2026-08-13-launcher`](design-qa/2026-08-13-launcher/).
- My Wave affinity and learner-fit: `my-wave.test.ts` and
  `next-practice/recommend.test.ts`.
- One-field and reduced-motion behavior:
  [`2026-08-13-wave-field`](design-qa/2026-08-13-wave-field/).
- notation, kit key, and correction disclosure:
  `ContinuousNotation.test.ts`, `NotationGlossary.test.tsx`,
  `TutorHud.test.tsx`, `SongView.test.tsx`, and
  [`2026-08-13-teach`](design-qa/2026-08-13-teach/) plus
  [`2026-08-13-legend`](design-qa/2026-08-13-legend/).
- full-window song, Journey, result, and statistics captures:
  [`2026-08-13-push`](design-qa/2026-08-13-push/).
- the current checkout passed `205` test files / `2,099` tests and typecheck.
  That check includes uncommitted work, so it does not certify a kb.15 package.

## not included in this release claim

The current checkout also contains a larger automatic-import lane: exact
YouTube candidate matching, fetched-audio provenance, source-row cleanup, and
new retry screens. It is uncommitted, not packaged, and has open interruption
cases. kb.15 does not claim that typing a name reliably downloads and imports a
song until that lane lands with a real end-to-end fetch/readback.

Bulk source collections are still metadata until each song has lawful audio,
a reviewed chart, and a launch proof. The existing one-favourite path is real;
it does not turn the whole library into playable music.

## evidence boundary

An actual Yamaha DTX402 session is still required to settle physical strike
arrival, pad mapping, pedal launch, two-metre zone readability, audible Flow
sync, tutor feel, and a full hands-free lesson. The kit-signal panel and
[`one-minute kit drill`](kit-test-drill.md) give the exact check.

No kb.15 DMG has been built, signed, notarized, stapled, or installed. The
manifest still declares kb.14, and no public release or deployment has been
created.

## distribution

- Source commits: `7f4c2d4`, `8653fd5`, `1988493`, `d549699`, `190e765`,
  `88aa88c`, `ac6f199`
- Release: [GitHub v1.2.0-kb.15]({{RELEASE_URL}})
- Apple Silicon DMG SHA-256: `{{DMG_SHA256}}`
