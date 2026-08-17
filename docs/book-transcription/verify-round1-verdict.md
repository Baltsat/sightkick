# Round 1 verdict — the book pack is not fit to ship

Nine pages were re-read blind, by three independent readers who did not open
the recorded YAML until their own reading was written down. Method is
VERIFY-CONTRACT.md round 1.

## Result

| page | verdict                                                                  |
| ---- | ------------------------------------------------------------------------ |
| 28   | clean — 5 exercises, 34 bars, exact match                                |
| 59   | clean — 10 of 10 match                                                   |
| 73   | clean — 16 of 16 match, including every accent mask                      |
| 80   | clean — 9 of 9 match, including pickup kicks and a broken-triplet hi-hat |
| 41   | **defective**                                                            |
| 49   | **defective**                                                            |
| 53   | **defective**                                                            |
| 65   | **defective**                                                            |
| 69   | **defective**                                                            |

Five of nine sampled pages carry defects. Extrapolated over 45 transcribed
pages, that is not a pack he can practise from.

## What is wrong, by kind

**Invented content — the worst kind, and the one he already caught once**

- Page 41, exercises 1-4: a kick drum voice was added to all eight bars. The
  book's own text says the bass drum enters at exercise 5, and the staves
  there are single-line snare only.
- Page 53, `L9.E2`: three snare hits with no note head on the page. Bar 1 is
  byte-identical to `L9.E1` bar 2, so this is a copy-paste, not a misread.
- Page 49, the fill groove example: one bar recorded as an admitted generic
  approximation rather than read from the page.

**Missing exercises and bars**

- Page 69, "Triplet Exercise 2" box 8: two full bars absent under any id. What
  is recorded as E7 and E8 are both bars of exercise 7.
- Page 41, exercise 7: the page prints eight bars under one box. Four were
  recorded, and those four do not match the printed bars 1-4.
- Page 49: the fill bar and the crash ending bar are absent.
- Page 53: the Flams technique box was never transcribed.

**Wrong content**

- Page 41, exercises 5, 6 and 8: denser eighth-note patterns recorded than the
  quarter and eighth mix actually printed.
- Page 49, "Accent Shifting" 1-8: only one of the two to four printed accents
  kept per exercise, and marked `uncertain: false` - asserted as confirmed
  while incomplete.
- Page 53, `L9.E4` and `L9.E7`: kick recorded where the page prints snare.
- Page 69: the three intro triplet illustrations each drop their trailing
  quarter note.

**Lane conflict**

Page 65 exists twice, in `pages-59-66.yaml` and `pages-65-66c.yaml`, with
incompatible readings of `L12.E11`. Nothing decides which wins.

## What follows

1. The pack stays out of the shipped lesson library. A wrong grid is worse
   than no lesson, because he practises the wrong thing and the app marks him
   correct for it.
2. Round 1 must cover all 45 pages, not 9. The sample already proves the
   generator's failure mode survived: content asserted with `uncertain: false`
   that is not on the page.
3. Every page that fails is re-transcribed from the page image, never patched
   from the existing YAML.
4. `uncertain: false` has to mean something. On this evidence it currently
   means "the writer did not doubt it", which is not the same as "it is on the
   page".

The four clean pages show the reading itself is achievable at this resolution.
The failures are not an eyesight problem, they are a discipline problem.
