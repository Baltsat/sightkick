# Page coverage ledger — Drumset Method 1

VERIFY-CONTRACT.md round 2 asks for a book -> app completeness account. That
needs a reason for every page the transcription set does not cover. This is
that account.

Source: `pdfcoffee.com_kennan-wylie-amp-gregg-bissonette-drumset-method-1pdf-5-pdf-free copy.pdf`
(90 PDF pages, scanned images, no text layer).

## Covered

45 pages carry transcribed exercises, 396 items total, in
`tmp/lanes/transcribe/pages-*.yaml`. The covered span is pages 24-85.

## Not covered, with the reason

### Blank pages in the source (17)

26, 31, 35, 40, 44, 48, 52, 55, 58, 63, 68, 72, 75, 79, 82, 84, 86

These render white in four independent pipelines. That alone could have been a
broken extraction, so it was settled against the PDF itself rather than against
any render:

    pdfimages -list -f <page> -l <page> <pdf>

Every one of the 17 pages holds **zero** embedded images. Every content page
checked as a control (27, 30, 47, 49, 87) holds exactly one. A scanned book
stores each printed page as one image, so zero images means the page really is
empty — a failed extraction would have left the image in place.

They also fall in a pattern: each sits immediately before a `Lesson N:` opener,
and every opener lands on an odd page. That is ordinary print imposition, where
a blank filler keeps each section opening on a right-hand page.

Nothing to transcribe. Not a defect.

### Pages with content but no exercises

- **27** — "Lesson 3: Coordination" opener. Prose, two technique photos, and a
  "One-Measure Repeat Sign" legend box. The legend is a symbol reference, not a
  playable item.
- **87, 88, 89** — Glossary A-F, G-S, T-W, then author bios and
  acknowledgments. A few entries draw a symbol (accent, coda, fermata, repeat)
  inside the definition. Again reference, not exercises.

### Front matter, pages 1-23

Blank in the source (zero embedded images): 5, 6, 12, 18, 22.

No exercises:

- **1, 2, 3, 4** — cover, copyright, contents, introduction.
- **7** — audio and video icon legend.
- **8** — drumset parts diagram.
- **9, 10** — kit setup text and photos.
- **11** — drumstick and snare drum anatomy diagrams.
- **13** — extra gear, drum care, tuning.
- **14, 15, 16** — grips and strokes, prose and photos.
- **20** — bass drum technique.
- **21** — hi-hat technique.
- **23** — reading basics and the notation key showing where each drum sits on
  the staff. Reference, not a playable item.

## Open gap — 25 exercises are missing

- **17** — "The Rebound Stroke (8 on a hand)", one sticking drill
  (RRRRRRRR / LLLLLLLL) under a TECHNIQUE callout.
- **19** — the Lesson 1 "Sticking Exercise" set, numbered 1-24. Each is a
  two-part eight-letter R/L pattern, marked to be practised at 150, 170 and
  190 BPM.

These are real drills he is meant to play, and the transcription set does not
have them because it starts at page 24. They are written in sticking letters
rather than staff notation, so they need a decision before transcription: the
app's grid format assumes note heads on a staff. Either they map to snare notes
with an R/L sticking label per note, or they need their own item kind.

Nothing else in the book is unaccounted for.

## Standing rule

A page is only marked skippable with a stated reason and evidence. "It looked
blank" is not a reason.
