# The kit is the launcher

Owner direction, 2026-08-13: "непонятно, что означает, что тик… чтобы было написано типа My Wave… хай-хет — или что-то такое, оно какое-то действие. То есть там любимую песню проиграть, или урок, или My Wave чтобы ты сам подобрал, или какой-то чарт, топ-3 песен, быстрый вход, быстрое меню, или что-то новое. Короче, продумать use case: что где когда нажимается."

Also: "это не отдельный My Wave должен быть" — My Wave is not a nav item. In Yandex Music, My Vibe is one button that starts your stream. Ours is one pad.

## The decision

Home has no menu of features. It has a drum kit, and every drum is a door. He is already sitting at the kit with sticks in his hands; the kit is the only input device that costs him nothing to use.

| Zone                          | What it starts                                                           | Why this drum                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Kick**                      | Continue — resumes the armed target, or the last thing he was working on | The pedal is always under his foot. The biggest, most central object gets the most-used action.                                        |
| **Snare**                     | **My Wave** — the personal stream picks the next thing and plays it      | The snare is the drum he strikes most. My Wave is the "just take me somewhere good" button, so it belongs on the most instinctive pad. |
| **Hi-hat**                    | The lesson path — next lesson in Journey                                 | Hi-hat keeps time; the curriculum keeps his direction.                                                                                 |
| **Ride**                      | His songs — the library, ordered by what he can play now                 | The ride is the "cruise" cymbal; browsing is the unhurried mode.                                                                       |
| **Crash**                     | Something new — find and add a song he does not have yet                 | A crash is an arrival. New material announces itself.                                                                                  |
| **Tom 1 / Tom 2 / Floor tom** | His top three — the songs he plays most, in order                        | Three toms, three favourites. Muscle memory: the same song is always on the same drum.                                                 |

Rules that make it honest:

- **Each zone carries its label**, quietly, in its own lane colour. He must never have to guess what a drum does. The label is part of the zone, not a tooltip that appears after he wonders.
- **A zone that has nothing behind it says so** and offers the nearest real thing. No top-three yet means those toms invite him to play something and build one.
- **A deliberate gesture starts a session**, never a stray tap. Same confirm rule already used in the Songs and Journey lists.
- **The armed target stays visible** — the title above the kit says what the kick will continue.

## The field

One continuous surface, the kit photograph extended into it, the way `My Vibe` lets its artwork become the whole field. The sidebar stays — he needs a way back — but it is quiet, and **My Wave leaves it**, because My Wave is the snare.

Motion, borrowed in grammar not in look: slow gradient drift across the field, warm paper and ember rather than black glass and neon; the armed zone breathes; a struck zone flares once in its lane colour and settles. Motion marks a real event or a real state. Nothing loops for decoration, and reduced-motion keeps every state readable without it.

## What My Wave must balance

Two things at once, per his words: "с одной стороны максимизировать, что мне было очень круто, там классная песня; с другой — она действительно в зоне ближайшего развития".

So the stream is scored on both joy and fit: a song he loves that is slightly beyond his current reach beats a neutral exercise that is perfectly placed, and beats a beloved song far out of reach. The engine already computes skill similarity, a learner-relative difficulty step, and the reason string (`src/renderer/services/pedagogy/my-wave.ts`); what it lacks is the affection term — how much he actually likes this music, from his favourites and from what he replays — and a single honest line saying why this, now.
