# Drumroll kb.14 installed verification

Release bundle: `release/kb14-final-20260813T084451Z/`

Before packaging, the previous `kb13-final-20260813T062753Z` release and its older installed-app backup were removed from the release directories; after installed verification, both were permanently removed. The only retained installed-app backup is `release/installed-backups/Drumroll-1.2.0-kb13-pre-kb14-20260813T084451Z.app`.

| check                     | observed result                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------- |
| release version           | `1.2.0-kb.14` (`CFBundleVersion` `1.2.14`)                                              |
| installed app             | `/Applications/Drumroll.app` copied with `ditto` from the stapled DMG                   |
| code signature            | valid Developer ID application, team `3BGK34ZGS6`                                       |
| staple                    | `xcrun stapler validate /Applications/Drumroll.app` succeeded                           |
| Gatekeeper                | `spctl --assess --type execute --verbose=4` accepted it as a Notarized Developer ID app |
| app notarization          | `f721366f-77a3-461b-a632-dd0675091773` — Accepted                                       |
| DMG notarization          | `ff67532e-e95d-446d-9c33-d69b89c3adbf` — Accepted                                       |
| DMG SHA-256               | `79066955c1e01b73d71f381415356a1490609c7721bc4757248bdd60b0224a67`                      |
| release checksum manifest | every listed artifact passed `shasum -a 256 -c SHA256SUMS.txt`                          |

## Icon identity

The installed app has the kb.14 Drum Mark, not the prior Signal Disc.

- `assets/icon.icns`: `fb2251d16a71977cebcbb4cf1008ff57afed7bccb88d04306fbb3d6bc2102993`
- `/Applications/Drumroll.app/Contents/Resources/icon.icns`: `fb2251d16a71977cebcbb4cf1008ff57afed7bccb88d04306fbb3d6bc2102993`
- backed-up kb.13 app icon: `f06578e32576051e6c4305299f56f982853bae9d3cfb362a9a90a59e567600ec`

The current installed icon matches the source icon byte-for-byte and differs from the backed-up kb.13 icon.

## Visual proof

- `01-home-1225x768.png` and `01-home-1024x700.png`: home heading has deliberate top breathing room.
- `02-library-1225x768.png` and `02-library-1024x700.png`: artless songs use the neutral placeholder rather than the app mark.
- `03-journey-1225x768.png` and `03-journey-1024x700.png`: `Foundations` fits in its plaque at both target widths.
- `04-practice-1225x768.png` and `04-practice-1024x700.png`: the speed-change notice is visible and reversible.
- `05-result-1225x768.png` and `05-result-1024x700.png`: the evidence/action transition has no leftover flex gap.
- `06-finder-applications-real-size.jpeg`: native Finder capture of the installed app at 64 px.
