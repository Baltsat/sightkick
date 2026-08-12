# drumroll engagement mechanics v1

status: research-backed product selection and implementation backlog
date: 2026-08-11
scope: one committed drummer on macOS, practicing at a physical kit toward a September 10 song goal

## decision in one screen

Drumroll should make the player return because the next few minutes have a clear musical point, a visible path to a favourite song, and a satisfying proof that the playing changed. It should not try to win through panic, attendance theatre, scarcity, or a fake social graph.

The selected loop is:

1. the kit-home arms one short, evidence-backed session with a song payoff;
2. playing produces a real musical receipt: what improved, what remains, and one worthwhile next rep;
3. the streak, XP, trophies, and goal runway make that craft visible without becoming a second game;
4. optional macOS presence remembers the next musical action, never guilt or a midnight deadline.

This is deliberately narrower than the full Duolingo stack. Drumroll has one learner, a physical instrument, private local evidence, and an intrinsic target. The strongest retention mechanic is therefore a credible “I can now play more of this song” loop, not a leaderboard.

## product constraints

| constraint                                        | implication                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| physical kit, desktop distance, and live notation | engagement information must be peripheral during a run; the score, playhead, hit verdict, and drummer remain primary       |
| one committed learner                             | public leagues, friend dependency, growth referrals, and cohort competition have little upside and substantial distraction |
| September 10 target                               | show a concrete skill-to-song runway and a calm weekly pace; do not manufacture a deadline event or promise an outcome     |
| real musical improvement matters                  | durable rewards consume saved practice evidence, not app opens, button taps, elapsed foreground time, or arbitrary log-ins |
| no punitive mechanics                             | misses, pauses, breaks, and low scores never burn lives, delete currency, lock practice, or damage a goal                  |
| warm-studio visual language                       | home remains one composed kit ritual; no dashboard of badges, coloured pills, or stacked mobile cards                      |
| local-first app                                   | no account, cloud social graph, or analytics service is needed for the selected set                                        |

## current Drumroll substrate

The implementation already contains much more than a generic XP counter. The backlog below extends these contracts instead of adding a second engagement system.

| existing asset                                                                | canonical source area                                                                                                                                                      | what is already true                                                                                                             | consequence for this spec                                                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| daily practice days, current and longest streak, daily XP, seven-day activity | src/renderer/hooks/useGamification/useGamification.ts; src/renderer/services/streaks/streaks.ts; src/main/ipc/gamification.ts                                              | practice days are persisted; a first completed run has a bonus; the header and song view share the same result                   | retain one daily activity ledger; add clearer meaning and a gentle return path rather than a new streak database |
| daily XP target                                                               | src/renderer/hooks/useGamification/types.ts; src/renderer/components/GamificationHeaderStrip/GoalPopover.tsx                                                               | Casual, Regular, Serious, and Intense targets already map to 30, 50, 100, and 200 XP                                             | turn this from a raw quota into a quiet session-intensity choice; do not introduce boosts or multipliers         |
| evidence-gated rewards                                                        | src/renderer/views/SongView/SongView.tsx; src/renderer/components/ScoreSummary/ScoreSummary.tsx                                                                            | XP, stars, high-score state, and achievements are minted only after the practice evidence reaches disk                           | preserve this as a hard rule for every new task, milestone, and streak credit                                    |
| calm run-end rewards                                                          | src/renderer/components/ScoreSummary/ScoreSummary.tsx; src/renderer/components/AchievementToastQueue/AchievementToastQueue.tsx                                             | the summary already shows XP, goal progress, nudge, and one achievement at a time                                                | make the existing summary a musical receipt, not a rewards wall                                                  |
| day streak versus in-run clean-hit streak                                     | src/renderer/services/streaks; src/renderer/services/streak; src/renderer/components/StreakMeter                                                                           | the plural service is the long-term practice streak; the singular service is the live consecutive-hit meter                      | keep the two meanings visibly separate; the live meter is craft feedback, never a punishment or habit score      |
| kit-home session composer                                                     | src/renderer/components/HomeCockpit/HomeCockpit.tsx; src/renderer/services/next-practice/home-session.ts; src/renderer/services/pedagogy/session-composer.ts               | Home already composes a launch, next unlock, and musical payoff from ranking, practice wave, goal path, energy, and recent exits | make this the entry point for daily engagement; do not create a separate Quests page                             |
| favourite-song path and deadline pacing                                       | src/renderer/components/Goals; src/renderer/components/Profile/GoalCard.tsx; src/renderer/services/pedagogy/song-goals.ts; src/renderer/components/Profile/ProfileView.tsx | primary song goals, optional target date, blockers, safe section probe, review queue, and weekly target are already modeled      | surface the existing path more often and more musically; never replace it with a generic progress percentage     |
| adaptive error review                                                         | src/renderer/components/AICoach; src/renderer/components/PracticeStats; src/renderer/services/pedagogy; src/renderer/hooks/useRemediationSession                           | the app can keep bar-level evidence, lane weakness, timing bias, pad confusion, targeted loops, and matching lessons             | selected tasks must point to a real trouble bar, skill, or song section; no made-up “challenge”                  |
| Journey and stars                                                             | src/renderer/components/LessonsJourney; src/renderer/components/Stars                                                                                                      | 170 authored exercises, prerequisites, seasons, and best-performance stars exist                                                 | make milestones express real ability and repertoire connection, not collection completion                        |
| macOS system presence                                                         | src/main/AppState.ts; src/main/menu.ts; src/preload/index.ts                                                                                                               | the native main process and application menu exist; no practice notification, tray, or menu-bar presence exists today            | leave this native work in P2 and keep it opt-in, local, and sparse                                               |

## evidence standard

Three evidence types appear below:

- product evidence shows that a feature exists and how a large app frames it. It does not prove the same effect for a single drummer.
- company experiment evidence is useful directional data but remains company-reported and tied to its own audience and business model.
- research evidence is broader but still transfers imperfectly from classroom or physical-activity settings to musical motor learning.

The strongest general evidence supports feedback and monitoring, goal setting, prompts and cues, and positive reinforcement. A 2024 PRISMA review of 41 digital habit interventions found feedback and monitoring in 88%, prompts and cues in 80%, and goal setting in 65%; it also warns that most studies were short-term. [Digital Behavior Change Intervention Designs for Habit Formation: Systematic Review](https://www.jmir.org/2024/1/e54375)

Gamification itself is a small effect, not a substitute for pedagogy. A 2024 meta-analysis of 35 interventions and 2,500 participants reported a small overall advantage for gamified learning, Hedges’ g = 0.257, and stresses autonomy, competence, and relatedness rather than pressure. [Gamification enhances student intrinsic motivation, perceptions of autonomy and relatedness, but minimal impact on competency: a meta-analysis and systematic review](https://link.springer.com/article/10.1007/s11423-023-10337-7)

For Drumroll, competence is the hard criterion: did a saved run show a cleaner phrase, stronger delayed recall, better timing, or a larger playable song section? Engagement mechanics only earn their place when they increase those proofs.

## research catalogue

### Duolingo’s full stack

| mechanic                             | what actually exists                                                                                                                                                                                                                                                                                                                                                                                                                                            | psychological job and evidence                                                                                        | Drumroll verdict                                                                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| separate streak from daily goal      | Duolingo changed the rule so one lesson extends a streak while the daily goal remains separate. Its company A/B test reported relative lifts of 3.3% in Day-14 retention, 1% in daily active learners, and 10.5% in learners on a streak after 20 days. [Duolingo’s streak experiment](https://blog.duolingo.com/improving-the-streak/)                                                                                                                         | lowers the activation threshold while preserving a stretch target; avoids making a busy-day minimum feel like failure | adopt the separation. A 5-minute or one prepared block minimum earns the day; the desired session length remains a separate choice                                                                                                                            |
| streak protection                    | Duolingo’s streak freeze fills a missed day before the lapse breaks continuity. [How Duolingo protects streaks](https://blog.duolingo.com/protecting-streaks-from-site-issues/) Its older Weekend Amulet A/B test reported 4% more week-later return and 5% fewer broken streaks when people could take a weekend break. [How streaks keep learners committed](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/) | loss aversion can motivate, but flexibility prevents the streak itself from becoming the task                         | adapt, not copy. Preserve actual practice history and personal best. A planned rest or lapse never fakes activity, deletes mastery, or demands a repair currency                                                                                              |
| daily quests and monthly challenge   | Duolingo shows three daily quests and a month-long quest score. It changed the monthly challenge from XP-based to quest-based because XP farming could concentrate effort in a few days. [Duolingo’s Time Spent Learning Well metric](https://blog.duolingo.com/time-spent-learning-well/)                                                                                                                                                                      | gives a clear starting point, variety, and small closure moments; can also turn into quota-chasing                    | adapt as optional practice cards drawn from review, build, and song application. No countdown reward, no required three-of-three, no generic “do N lessons”                                                                                                   |
| XP economy, achievements, and boosts | XP crosses Duolingo subjects and feeds quests, achievements, and leaderboards. [Duolingo’s Math, Music, and Language integration](https://blog.duolingo.com/new-subjects/)                                                                                                                                                                                                                                                                                      | immediate evidence of effort; the danger is treating points as the product                                            | retain Drumroll XP as effort evidence, separate from mastery and stars. Reject boosts, power-ups, and any incentive for repetitive low-value runs                                                                                                             |
| leagues and tournaments              | weekly cohorts rank by XP, promote or demote, and offer a Diamond Tournament. [How Duolingo Leaderboards and Leagues Work](https://blog.duolingo.com/duolingo-leagues-leaderboards/)                                                                                                                                                                                                                                                                            | social comparison and a visible weekly finish line can increase short-term activity                                   | reject. Duolingo itself reports that leaderboards can favour a small already-active group, create XP grinding, and feel unfair to content-focused learners. [Duolingo’s Time Spent Learning Well metric](https://blog.duolingo.com/time-spent-learning-well/) |
| friend quests and nudges             | Duolingo randomly pairs mutual followers for a five-day challenge; its own announcement says followers are 5.6 times more likely to finish a language course. The flow includes pre-written nudges, reminders, gift XP, and quest points. [Friends Quests](https://blog.duolingo.com/friends-quests/)                                                                                                                                                           | accountability, reciprocity, and fear of letting a partner down                                                       | reject as a product loop. It conflicts with a private one-player kit ritual and imports social guilt. A later optional share card can support real-world encouragement without making another person responsible for practice                                 |
| mistakes review                      | the Practice tab lets a learner select focused skill work and explicitly review prior mistakes. [Duolingo Practice Hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/)                                                                                                                                                                                                                                                                              | turns a mistake from a verdict into a next action; supports competence and agency                                     | adopt strongly. Drumroll already has exact weak bars, lane accuracy, timing bias, and targeted loops. The missing work is surfacing them as a satisfying deliberate-practice invitation                                                                       |
| notification selection               | Duolingo analyzes large reminder data sets and spaces repeated copy because novelty fades. [How the Duolingo Owl decides what notification to send](https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/)                                                                                                                                                                                                                                               | a timely cue lowers recall friction; repeated prompts rapidly become noise                                            | adapt the frequency lesson, reject the manipulation. One scheduled, user-chosen macOS cue may say what is ready to play; no streak-risk threat, faux emotion, or late-night escalation                                                                        |
| widget presence                      | Duolingo’s widget shows whether today’s lesson is done and the streak; the company says widget users had better retention even after controlling for prior commitment, while acknowledging selection effects. [Duolingo widget](https://blog.duolingo.com/widget-feature/)                                                                                                                                                                                      | makes a current commitment visible at the moment of environmental choice                                              | adapt to a menu-bar status, not a mobile-style mascot widget. It must be useful when glanced at from the kit                                                                                                                                                  |
| time-boxed FOMO events               | monthly quests, weekly leagues, tournaments, and short-lived boosts create regular urgency. [Duolingo’s Time Spent Learning Well metric](https://blog.duolingo.com/time-spent-learning-well/) [How Duolingo Leaderboards and Leagues Work](https://blog.duolingo.com/duolingo-leagues-leaderboards/)                                                                                                                                                            | deadlines pull action forward, but they also encourage unnatural pacing and extraction                                | reject. The September 10 target is a user-owned musical deadline, not a disappearing event. Show the next proof needed, not an urgency bar                                                                                                                    |

### Duolingo Music: the directly relevant transfer

| mechanic               | observed product detail                                                                                                                                                                                                               | Drumroll reading                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| skills become songs    | Music lessons teach rhythm, note literacy, listening, and eventually full songs; Music XP counts toward the same streak, quests, and achievements as other subjects. [Duolingo Music course](https://blog.duolingo.com/music-course/) | keep the unification of craft and reward, but Drumroll must prove physical drumming rather than screen taps                                                                   |
| special song nodes     | popular song nodes show album art, replay, score, stars, progress, “Perfect!” verdicts, and skill-aligned song placement. [Duolingo popular songs in Music](https://blog.duolingo.com/popular-songs-music-course/)                    | adopt the payoff architecture: a favourite-song section is a visible reward for prerequisite work. Do not gate normal practice behind subscription or arbitrary replay limits |
| real-instrument bridge | Duolingo’s 2025 update added a Music instruments tab for practice on a real piano. [Duolingo 2025 product highlights](https://blog.duolingo.com/product-highlights/)                                                                  | Drumroll begins where this feature arrives: physical MIDI evidence must be the centre of the loop, with the game layer subordinate to the kit                                 |

### music-learning products

| mechanic                                  | observed product detail                                                                                                                                                                                                                                                                                                                                                                                                                        | psychological job and evidence                                                                     | Drumroll verdict                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minimum viable practice                   | Melodics uses a 5-minute daily goal and explicitly says not to overdo it; it preserves a “total effort matters” frame after a broken streak. [Melodics: What are Streaks?](https://support.melodics.com/en/articles/6777043-what-are-streaks) Simply Piano currently offers a weekly 5-minute workout with three choices. [Simply Piano: 5-minute workouts](https://piano-help.hellosimply.com/en/articles/7939170-what-are-5-minute-workouts) | reduces starting friction while leaving room for serious sessions                                  | adopt. Offer a 5–8 minute “keep the hands warm” path and a 20–30 minute planned session; neither is a moral obligation                                   |
| effort currency distinct from skill       | Melodics’s May 2026 XP and Stardom update awards every session, but explicitly says Stardom measures effort and commitment rather than skill. [Melodics: XP and Stardom](https://support.melodics.com/en/articles/15091901-xp-and-stardom)                                                                                                                                                                                                     | keeps low-confidence days from feeling empty without pretending time is mastery                    | adopt the distinction. Drumroll XP tracks played evidence; song stars and atomic retained or transferable state are skill claims                         |
| current-level weekly goals                | Melodics assigns weekly lessons that match a current Stage, keeps old lessons playable after refresh, and calls the goals optional. [Melodics: Weekly Goals](https://support.melodics.com/en/articles/15091960-weekly-goals)                                                                                                                                                                                                                   | replaces choice paralysis with a relevant start while preserving autonomy                          | adapt. Make a small weekly “practice set” from existing recommendation and review data. Old tasks stay available and receive normal credit               |
| deliberate loop, review, and speed ladder | Melodics prompts orientation, chunking, focused slow work, evaluation, repeat, and auto-BPM or wait mode. [The Melodics Approach](https://support.melodics.com/en/articles/8051176-the-melodics-approach)                                                                                                                                                                                                                                      | the satisfying unit is a conquered phrase, not a completed timer                                   | adopt strongly. Drumroll already has loop, speed, tutor, and recovery mechanics; attach celebration to a verified phrase or transfer, not a life counter |
| real-time accuracy plus profile history   | Yousician currently markets custom daily exercises, a Riff of the Day, profile-level streak timeline, badges, activity report, accuracy/timing points, and rising technique/song levels. [Yousician guitar product page](https://yousician.com/guitar?bx=true)                                                                                                                                                                                 | makes the player feel an ongoing personal story rather than a disconnected lesson queue            | adapt the activity-report idea into Insights and recap. Skip generic badge proliferation                                                                 |
| guided 30-day craft arc                   | Drumeo’s 30-Day Independence is a 20-workout course with daily 10-minute play-alongs, gradual weekly musical application, and freedom to work at one’s own pace. [Drumeo 30-Day Independence](https://shop.musora.com/products/30-day-independence)                                                                                                                                                                                            | a finite named arc gives the learner a credible near-term identity and reduces planning burden     | adapt to the September 10 goal as a transparent runway with adjustable pace, not a rigid daily program                                                   |
| optional stars after learning             | Simply Piano’s current Star Levels draw on songs and skills from recent lessons, offer up to three stars, and are explicitly optional rather than a requirement to advance. [Simply Piano: Star Levels](https://piano-help.hellosimply.com/en/articles/7943591-understanding-star-levels)                                                                                                                                                      | creates extra challenge for motivated players without blocking learners who want to move on        | adopt. Song-section “auditions” are optional probes and celebrate a musical result; they never block the next lesson                                     |
| weekly streak and earned freeze           | Simply Piano currently uses a weekly practice streak and automatic freezes earned after continued practice. [Simply Piano: How streaks work](https://piano-help.hellosimply.com/en/articles/15496066-how-do-streaks-work-in-simply-piano)                                                                                                                                                                                                      | recognizes that real instrument practice has more schedule friction than a one-minute phone lesson | adapt the weekly-rhythm idea. Let the learner choose daily or weekly rhythm; a calendar must record a rest honestly instead of calling it practice       |

### habit and learning products outside music

| mechanic                              | observed product detail                                                                                                                                                                                                                                                                                          | Drumroll verdict                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| non-destructive streak repair         | Brilliant lets a learner earn up to two Streak Charges from lessons or practice. A charge holds the streak but does not claim a day of activity or extend it. [Brilliant: Streak Charge](https://brilliant.org/help/features/what-is-a-streak-charge/)                                                           | useful design distinction. If Drumroll later needs protection, keep “actual play” and “continuity protected” visibly different. Do not build a collectible freeze economy in P0                                     |
| gentle companion and narrative payoff | Finch links completed goals to a companion adventure, lets people add goals, gives a home-screen widget reminder, frames streaks as gentle consistency, and includes invitations and limited seasonal events. [Finch New User Guide](https://help.finchcare.com/hc/en-us/articles/42149821015693-New-User-Guide) | borrow the gentleness and returned-with-a-story feeling only. Reject pet progression, daily shop rotation, invitations, and limited-time rewards; a drummer needs a musical identity, not a second maintenance game |
| completion-only streak                | Elevate counts a streak after the daily workout or puzzle is complete, with a freeze if missed. [Elevate: What is a streak?](https://support.elevateapp.com/hc/en-us/articles/4402925042715-What-is-a-streak)                                                                                                    | confirm that the activity threshold should be real playing, not opening Drumroll                                                                                                                                    |
| small, revisable goals                | Simply Piano’s current practice guidance tells learners to set reasonable short- and long-term goals, revise them when needed, slow a difficult section, and switch pieces if frustrated. [Simply Piano: Best Practice Tips](https://piano-help.hellosimply.com/en/articles/2791126-best-practice-tips)          | adopt as an explicit escape hatch: “easier”, “different song”, and “finish here” are valid player choices, not failure paths                                                                                        |
| collectible unlocks                   | Simply Piano’s children profile earns XP, levels, and musical rewards such as Tempo Rush and Song Mix, with visible future requirements. [Simply Piano: XP and rewards](https://piano-help.hellosimply.com/en/articles/15913867-how-do-xp-and-rewards-work-kids-profiles)                                        | adapt only the transparent unlock: a new kind of musical test, song section, or practice tool can be revealed with its required skill. Reject random loot, cosmetic hoarding, and child-coded rewards               |

## selected set

### adopt

| selected mechanic                       | why it belongs in Drumroll                                                                           | visible expression                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| one armed session with a song payoff    | it converts “what should I do?” into a playable first hit and connects drills to the desired song    | kit-home manifest: Focus → Build → Play it in a song                                                                      |
| real-practice streak plus weekly rhythm | consistency is useful when it records actual kit time and does not erase the underlying body of work | header flame stays compact; Insights shows current streak, longest streak, active days, and a warm re-entry after a lapse |
| craft XP separated from skill proof     | effort deserves acknowledgement; mastery needs stricter evidence                                     | XP in the header and recap; stars, retained skills, and song readiness elsewhere                                          |
| adaptive mistake-to-loop path           | this is the mechanism most coupled to real improvement                                               | Coach, recap, and Home all name one trouble bar or lane and offer a one-tap loop                                          |
| favourite-song runway                   | a named song and date supply meaning the generic curriculum cannot                                   | Home payoff, Profile goal card, safe section probes, and a weekly pace only when evidence supports it                     |
| calm musical recap                      | closing a session with a credible delta makes return satisfying                                      | warm-paper recap with one changed fact, one earned thing, and one next action                                             |
| optional delayed review                 | spaced return validates learning better than same-session repetition                                 | Home and Insights expose due review as an invitation with a clear reason                                                  |

### adapt

| source mechanic            | Drumroll version                                                                                                    | explicit guardrail                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Duolingo-style quests      | two or three optional practice cards: Review, Build, Apply. Each card names its evidence source and can be replaced | task count, XP, or minutes never qualify by themselves; no card expires with a lost reward |
| freezes and streak charges | visible “planned rest” and “continuity protected” state, separate from played days                                  | no fake activity; no gem store; no request to recover a number before returning            |
| weekly goal refresh        | a current-level practice set built from the existing practice wave and review queue                                 | a refreshed set does not make last week’s work inaccessible or lower its value             |
| short workouts             | 5–8 minute ready-made practice entry and a 20–30 minute session plan                                                | the short path is a deliberate musical action, not a token run                             |
| milestone unlocks          | unlock a safe song-section audition, new performance mode, or visible skill path                                    | rewards expand music-making; no random loot or purchasable advantage                       |
| widget and notification    | opt-in menu-bar readout plus a single user-scheduled reminder                                                       | no distress copy, no fake social voice, no late-day escalation, and no external telemetry  |
| private share card         | optional export of a concrete performance milestone or before/after evidence                                        | no feed, follower count, referral loop, or automatic sharing                               |

### reject

| mechanic                                                                                         | why it is wrong here                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| lives, hearts, energy loss, damaged currency, and forced retry                                   | a miss is useful performance data. Penalizing it makes the player avoid the exact work that improves drumming                          |
| public leagues, global rank, demotion, and tournaments                                           | they reward available time and score farming more readily than musical progress; Drumroll has no active cohort to make them meaningful |
| friend quests, partner dependency, nudges sent on another person’s behalf                        | the mechanic converts personal practice into obligation to an absent third party                                                       |
| limited-time events, expiring content, urgency bars, and “last chance” copy                      | the user already has a legitimate song date. Additional scarcity clouds the signal and asks for compulsive use                         |
| variable-ratio loot, surprise currency, daily shop rotation, paid streak repair, and XP boosters | the app should make music itself rewarding; opaque reward schedules teach the wrong habit                                              |
| streak for opening the app or watching a demo                                                    | it produces attendance theatre and contaminates the evidence model                                                                     |
| generic “do N lessons” task quotas                                                               | a lesson count says nothing about the player’s trouble bar, goal song, or retained skill                                               |

## engagement contract

### evidence and reward rules

1. practice credit requires saved practice evidence plus either five cumulative active minutes that day or one completed prepared session block. Opening the app, browsing, changing settings, and watching a preview do not count.
2. XP acknowledges effort. It remains additive and local; no activity subtracts XP.
3. stars, goal readiness, and retained or transferable atomic skill state remain separate claims. They require the existing higher-quality score and delayed or changed-context evidence.
4. one day has one first-session bonus. Replaying a trivial loop cannot become the optimal XP strategy.
5. a poor run can earn effort credit and a precise recommendation. It cannot trigger a loss, an exclusion, a scolding alert, or a reset of meaningful progress.
6. a lapse ends only the current active streak. Longest streak, total practice days, skill evidence, trophies, song progress, and the right to return remain intact.
7. a target date is pacing context, not a threat. When retained evidence is insufficient, the UI says that plainly instead of predicting success.

### visual and interaction rules

| surface        | interaction rule                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| kit-home       | one main title and one armed action. The lower practice-wave shelf may hold Focus, Next, and Payoff; it must not turn into a habit dashboard           |
| practice flow  | no quest list, XP counter animation, deadline, or social information beside notation. A thin session-progress cue may appear only at phrase boundaries |
| recap          | one primary musical fact first, then XP/streak only as supporting evidence. One visible next action; no stacked reward carousel                        |
| Insights       | show the long story: goal runway, review queue, weekly rhythm, evidence, and practice history. Counts need a definition and time window                |
| macOS menu bar | an optional, restrained presence such as “Drumroll · 8 min groove review ready”. Clicking opens the already-armed session                              |
| notifications  | one user-chosen time slot, no more than one unopened reminder per planned practice day, suppressed after a recorded session or explicit snooze         |

## ranked implementation backlog

### P0 — make the current learning loop feel complete

#### P0.0 — make non-punitive practice a real contract

**Where:** SongView, ScoreSummary, StreakMeter, the existing Tutor/lives settings, and their focused tests.

**Change:** Treat current in-run lives only as an explicitly opt-in challenge presentation. In default learning and adaptive Tutor practice, a miss feeds recovery, speed adjustment, and a bar-level recommendation; it never burns a life. No XP, streak, goal, star, or achievement path may inspect remaining lives. Rename any retention-facing copy from “danger” or “lost” to clear musical feedback and recovery.

**Why first:** the rest of the engagement layer becomes incoherent if a player is simultaneously told that mistakes are evidence and punished for generating evidence.

**Acceptance proof:** a miss-heavy saved practice run still receives its applicable effort credit, opens a targeted loop, retains access to the next practice action, and shows no negative currency or life-loss language in Home, recap, or Insights.

#### P0.1 — turn the existing kit-home manifest into today’s practice contract

**Where:** HomeCockpit.tsx and HomeCockpit.css; home-session.ts; session-composer.ts; SongListView.tsx wiring.

**Change:** use the already-composed plan to present three compact, ordered blocks inside the existing Home manifest and lower wave:

| block  | copy shape                                | completion source                        |
| ------ | ----------------------------------------- | ---------------------------------------- |
| Focus  | “Review bar 13–16 at 0.7×”                | due review or evidence-backed weak bar   |
| Build  | “Two clean passes of alternating singles” | selected lesson or loop result           |
| Payoff | “Play the chorus entry in [goal song]”    | safe song probe or playable song section |

Offer two calm session sizes: “short set” and “full set.” Selecting either only changes which already-ranked blocks appear; it does not change global difficulty or hide free play. Keep Learning and Songs as the existing top-level intent switch.

**Design:** preserve the one dominant kit and one direct hit-to-start action. The blocks occupy the existing manifest and practice-wave shelf, never a new page or floating cards across the kit.

**Acceptance proof:** at 1224 × 768, a seated player can name the first rep, the musical payoff, and how to start without reading the rest of the app. A new user with no evidence sees an honest fallback, not fake personalised tasks.

#### P0.2 — expose the September 10 song runway where practice begins

**Where:** HomeCockpit.tsx; home-session.ts; song-goals.ts; ProfileView.tsx and GoalCard.tsx.

**Change:** when a primary goal has a target date and a trustworthy goal path, Home’s payoff cell shows the next safe section probe and its prerequisite. Profile retains the fuller deadline pace and uncertainty. If the date exists but retained evidence is thin, show “building evidence for a weekly pace” rather than a forecast.

**Design:** a quiet line under the session target, such as “toward [song] · next proof: chorus entry at 0.7×.” Do not add a countdown, colour-coded urgency, or percentage that pretends preparation equals performance.

**Acceptance proof:** changing the primary goal updates the armed session and payoff; an unavailable or low-confidence chart makes no unsupported performance claim.

#### P0.3 — make ScoreSummary a musical receipt before it is a reward receipt

**Where:** ScoreSummary.tsx; SongView.tsx; PracticeStats; SummaryCoachCard; existing ScoreSummary and SongView practice-run tests.

**Change:** order the summary as:

1. one evidence-backed delta: a cleaner bar, timing movement, lane improvement, or newly completed song section;
2. one human-readable meaning: “the chorus no longer collapses at the tom fill”;
3. one action: replay this loop, continue the current plan, or take the song payoff;
4. supporting XP, daily progress, streak, and at most one calm achievement.

Suppress celebration motion when a run is merely repeated without an evidence delta. Preserve the existing one-at-a-time achievement queue.

**Acceptance proof:** every message can cite a saved field from the latest or comparable run. Summary-only legacy runs keep their existing honest limitation and never invent a trouble bar.

#### P0.4 — make daily XP and streak meaning legible

**Where:** useGamification.ts; services/streaks; GamificationHeaderStrip; GoalPopover; WeekDots; StatsPanel; gamification IPC tests.

**Change:** expose two distinct labels:

- “practice streak”: consecutive days with qualifying real practice;
- “today’s set”: the chosen short or full effort target, still expressed through the existing daily XP target.

Add a visible, non-dramatic re-entry state after a lapse: “new set, same progress.” Keep the current flame compact and let Insights hold history. Do not add freezes, gems, insurance, or repair purchase.

**Acceptance proof:** a missed day breaks only the active practice-streak number; historical practice, longest streak, XP, stars, goal evidence, and next action remain available.

#### P0.5 — use existing achievement infrastructure for craft, not volume

**Where:** services/achievements; AchievementToastQueue; ScoreSummary; ProfileView; achievement tests.

**Change:** rank achievements by meaningful musical proof:

1. first retained skill after a delayed review;
2. a timing-bias improvement across comparable runs;
3. a clean targeted-loop pass;
4. first safe goal-song section;
5. personal best song-section performance;
6. consistent practice milestone after the above are in place.

Keep volume milestones only as a quiet archive record. Never reward “opened Drumroll,” “completed 100 runs,” or a repeated low-effort loop more prominently than the musical events above.

**Acceptance proof:** an achievement definition names its required evidence event and does not unlock from elapsed time alone.

### P1 — add stickiness that improves practice quality

#### P1.1 — optional adaptive practice cards

**Where:** a small new renderer service beside the session composer; HomeCockpit; ProfileView; existing practice evidence types.

**Change:** derive up to three cards from the selected session:

| card   | source                                      | done means                              |
| ------ | ------------------------------------------- | --------------------------------------- |
| Review | Profile review queue or retention-due skill | one saved review run                    |
| Build  | current learning block or weak bar          | one loop or lesson block completes      |
| Apply  | song section or musical transfer            | one safe probe or application run saves |

Each card has “start,” “swap,” and “leave for later.” Swapping uses the next valid evidence-backed candidate, not randomness. Completing a card marks the day’s practice narrative but earns no exclusive time-limited prize.

**Acceptance proof:** cards always link to a playable item, cite their source, and remain possible to do after the calendar date changes.

#### P1.2 — weekly practice set and honest rhythm view

**Where:** session-composer.ts; ProfileView.tsx; PracticeHistory.tsx; WeeklyXpChart.tsx; GamificationHeaderStrip.

**Change:** build a weekly set from one due review, one prerequisite or current skill, and one musical application. The week may be configured as daily or weekly rhythm. The profile shows played days, planned rests, and the next available session; it never paints rests as failures.

**Design:** this belongs in Insights and a subtle Home line, not another primary navigation destination.

**Acceptance proof:** the set changes only when source evidence changes or the player explicitly asks for a new plan; old selected work remains playable and meaningful.

#### P1.3 — song-section auditions

**Where:** song-goals.ts; HomeCockpit; SongView; ScoreSummary; GoalCard; score and goal tests.

**Change:** after a prerequisite or retained skill milestone, offer a 30–60 second safe section of the favourite song at the recommended scaffold. Show the section name, speed, and what it tests before launch. Save the best evidence as a meaningful part of the goal runway.

**Why:** this is the highest-value dopamine loop available: the user hears the direct consequence of foundations in a song they care about.

**Acceptance proof:** a failed audition returns to one named prerequisite or loop; a successful audition updates the goal path without claiming full-song readiness.

#### P1.4 — weekly musical recap

**Where:** ProfileView.tsx; PracticeHistory.tsx; MasteryGraph.tsx; LearningEvidenceReceipt; local practice archive.

**Change:** add one “this week in your hands” panel with:

- actual sessions and played days;
- one skill that became more reliable or remains uncertain;
- one song section reached;
- one next recommendation.

No comparison with an ideal week, missed-session count, or pseudo-coach guilt. The recap should be shareable only later, not a feed.

**Acceptance proof:** every claim resolves to local saved runs or the archive, includes an evidence state, and gracefully says “not enough saved evidence yet” when appropriate.

#### P1.5 — phrase-tier presentation for the live clean-hit streak

**Where:** StreakMeter; services/streak; existing streak-motion gallery direction; reduced-motion tests.

**Change:** keep tier names and the clean-hit count as brief, peripheral musical feedback. On a miss, dissolve the effect, preserve best streak, and direct attention back to the phrase; do not flash red loss messaging.

**Acceptance proof:** reduced-motion retains the tier/count semantics, and the notation is never obscured.

### P2 — macOS presence and private proof artifacts

Implemented on 2026-08-12 as an explicit opt-in source slice. Its proof is
focused controller/renderer tests and `docs/design-qa/2026-08-12-p2/`; it does
not claim a delivered macOS notification from an unsigned development build or
any retention or learning effect.

#### P2.1 — opt-in menu-bar practice presence

**Where:** `src/main/practicePresence.ts`, `AppState.ts`, `preload/index.ts`,
the Practice presence Settings section, and focused native/IPC tests.

**Change:** the tray is absent until the player turns on Menu-bar presence. It
shows one of:

- “Drumroll · practice ready”
- “Drumroll · played today”

Clicking opens or focuses the app. The menu offers Start practice, Snooze until
the selected time, and Turn off reminders. It does not display a streak length
as a threat.

**Acceptance proof:** the state is derived locally, no network request or account exists, and an app-session completion suppresses the same day’s reminder.

#### P2.2 — respectful macOS notification

**Where:** the same native practice-presence module and Settings.

**Change:** the player selects one local time, then chooses whether to grant
notification permission. At most one notification appears on a local calendar
day, using the copy “Your practice set is ready when you are.” The player can
choose silent presence only.

**Acceptance proof:** no notification fires after practice, after Snooze, outside the chosen window, or based solely on an “at risk” streak. Copy contains no guilt, urgency, mascot emotion, or artificial deadline.

#### P2.3 — private performance postcard

**Where:** saved Practice `ScoreSummary`, the postcard dialog, and the existing
local PDF export channel.

**Change:** a player can explicitly export a small local artifact from a real
saved Practice run. They choose any combination of song section, saved
performance, date, and a comparable before/after measure. It never posts
automatically anywhere.

**Acceptance proof:** export is manual, contains only user-selected data, and never implies a performance capability beyond the saved evidence.

## implementation sequencing

1. P0.0 through P0.3 first. They correct the incentive structure and make the current practice loop intelligible without expanding the product surface.
2. P0.4 and P0.5 next. They sharpen existing XP, streak, and achievement contracts.
3. P1.1 through P1.4 once the player has used the P0 loop enough to expose which cards and recap facts are actually useful.
4. P2 is implemented as local, optional source-level work. It cannot compensate
   for an inaccurate session or substitute for the real-kit and longitudinal proof
   requirements.

## local validation plan

This is one learner, so do not invent population metrics or run an external retention experiment. Validate each mechanism against local evidence and the real kit:

| question                                    | proof                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| does Home remove the first-action decision? | from app launch, the player can name and start the intended first rep with one kit hit                                                                                          |
| is the reward tied to music?                | every recap claim links to a saved timing, lane, bar, song-section, or retained-skill fact                                                                                      |
| does a lapse remain emotionally cheap?      | simulate a missed practice day; all goal progress and return actions remain visible                                                                                             |
| does XP create grinding?                    | replay an easy loop many times; it cannot become a better route to goal readiness than a real review or application                                                             |
| does the September 10 plan stay honest?     | remove or weaken retained evidence; the UI reduces confidence or says it needs more evidence rather than forecasting success                                                    |
| do reminders help rather than harass?       | permission, schedule, suppression, Snooze, and disable paths all work locally; no reminder is built around streak risk                                                          |
| does the visual language survive?           | capture kit-home, Practice, recap, Insights, and menu-bar states at normal desktop viewing distance; reject any pass that turns Home into a metric dashboard or covers notation |

## source register

Research and product sources cited above:

- [Digital Behavior Change Intervention Designs for Habit Formation: Systematic Review — Journal of Medical Internet Research, 2024](https://www.jmir.org/2024/1/e54375)
- [Gamification enhances student intrinsic motivation, perceptions of autonomy and relatedness, but minimal impact on competency: a meta-analysis and systematic review — Educational Technology Research and Development, 2024](https://link.springer.com/article/10.1007/s11423-023-10337-7)
- [Duolingo: Improving the streak](https://blog.duolingo.com/improving-the-streak/)
- [Duolingo: Protecting streaks from site issues](https://blog.duolingo.com/protecting-streaks-from-site-issues/)
- [Duolingo: How streaks keep learners committed to their language goals](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/)
- [Duolingo: Friends Quests](https://blog.duolingo.com/friends-quests/)
- [Duolingo: Practice Hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/)
- [Duolingo: How to install the widget](https://blog.duolingo.com/widget-feature/)
- [Duolingo: How the owl decides what notification to send](https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/)
- [Duolingo: Leaderboards and Leagues](https://blog.duolingo.com/duolingo-leagues-leaderboards/)
- [Duolingo: Time Spent Learning Well](https://blog.duolingo.com/time-spent-learning-well/)
- [Duolingo: Music course](https://blog.duolingo.com/music-course/)
- [Duolingo: Popular songs in Music](https://blog.duolingo.com/popular-songs-music-course/)
- [Duolingo: 2025 product highlights](https://blog.duolingo.com/product-highlights/)
- [Melodics: What are Streaks?](https://support.melodics.com/en/articles/6777043-what-are-streaks)
- [Melodics: XP and Stardom](https://support.melodics.com/en/articles/15091901-xp-and-stardom)
- [Melodics: Weekly Goals](https://support.melodics.com/en/articles/15091960-weekly-goals)
- [Melodics: How it works](https://melodics.com/how-it-works)
- [Melodics: The Melodics Approach](https://support.melodics.com/en/articles/8051176-the-melodics-approach)
- [Yousician: guitar product page](https://yousician.com/guitar?bx=true)
- [Drumeo/Musora: 30-Day Independence](https://shop.musora.com/products/30-day-independence)
- [Simply Piano: How streaks work](https://piano-help.hellosimply.com/en/articles/15496066-how-do-streaks-work-in-simply-piano)
- [Simply Piano: 5-minute workouts](https://piano-help.hellosimply.com/en/articles/7939170-what-are-5-minute-workouts)
- [Simply Piano: Star Levels](https://piano-help.hellosimply.com/en/articles/7943591-understanding-star-levels)
- [Simply Piano: Best Practice Tips](https://piano-help.hellosimply.com/en/articles/2791126-best-practice-tips)
- [Simply Piano: XP and rewards for children’s profiles](https://piano-help.hellosimply.com/en/articles/15913867-how-do-xp-and-rewards-work-kids-profiles)
- [Brilliant: Streak Charge](https://brilliant.org/help/features/what-is-a-streak-charge/)
- [Finch: New User Guide](https://help.finchcare.com/hc/en-us/articles/42149821015693-New-User-Guide)
- [Elevate: What is a streak?](https://support.elevateapp.com/hc/en-us/articles/4402925042715-What-is-a-streak)
