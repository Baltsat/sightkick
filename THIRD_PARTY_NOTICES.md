# Third-party distribution notices

This file accompanies Drumroll distributions. It does not replace or alter
the license texts shipped beside the corresponding components.

## Groove MIDI Dataset

The optional local "Groove MIDI Dataset" practice pack is created from the
Groove MIDI Dataset by Google LLC. The source dataset is available at
<https://magenta.tensorflow.org/datasets/groove> under the Creative Commons
Attribution 4.0 International license:
<https://creativecommons.org/licenses/by/4.0/>.

Each imported item identifies the source in its player-visible artist field:
"Groove MIDI Dataset · Google LLC · CC BY 4.0." Its `song.ini` and the pack's
`catalogue.json` retain the source URL, licence URL, source performance ID, and
the conversion notice. Drumroll changes the Roland TD-11 mapping into its
`PART DRUMS` chart format, uses an eight-bar practice crop, repeats short fills
when needed, and creates a click track. The pack contains no source audio.

The dataset's MIDI-only archive is downloaded to a user-selected working
directory and imported into a local pack. It is not part of Drumroll's source
tree or application distribution. The import command verifies the upstream
archive SHA-256 before extraction.

## FFmpeg 8.1.2

The Apple Silicon edition of Drumroll includes separate `ffmpeg` and
`ffprobe` command-line programs built without source changes from the official
FFmpeg 8.1.2 source archive. Drumroll invokes these programs as child
processes; the Drumroll application is not linked to FFmpeg libraries.

- Project: <https://ffmpeg.org/>
- Corresponding source archive:
  <https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz>
- Source archive SHA-256:
  `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- License information: <https://ffmpeg.org/legal.html>
- Reproducible build recipe: `scripts/prepare-ffmpeg-runtime.sh`
- Machine-readable build contract: `scripts/ffmpeg-runtime-contract.mjs`

This build reports the GNU Lesser General Public License, version 2.1 or
later. Its configuration deliberately uses `--disable-autodetect` and
`--disable-everything`, then enables only the formats, codecs, protocols, and
filters needed by Drumroll. It does not use `--enable-gpl`,
`--enable-version3`, or `--enable-nonfree`. The only enabled external library
is the system zlib, and the release verifier rejects non-system dynamic
library dependencies.

The distribution includes FFmpeg's `COPYING.LGPLv2.1`, upstream `LICENSE.md`,
and `provenance.json` beside the executables under `ffmpeg-runtime/`. The exact
corresponding source remains available from the pinned official URL above;
the release also publishes `ffmpeg-8.1.2.tar.xz` beside the Drumroll artifact.
The source hash and complete configure arguments are recorded in
`provenance.json` and `distribution-integrity.json`.

## Drumroll application source

Drumroll itself is distributed under the root MIT license included as
`licenses/Drumroll-MIT.txt` in the application bundle.
