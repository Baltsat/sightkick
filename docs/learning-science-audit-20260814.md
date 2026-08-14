# drumroll learning-science audit — 2026-08-14

## answer

**verdict: partial.** Drumroll has real learning machinery: learner-relative task selection, scoreable DTX evidence, bounded error recovery, a two-pass remediation loop, and an explicit distinction between fresh acquisition, delayed retention, and transfer. Those mechanisms change the player’s experience; this is more than research citations in a product document.

The central failure is execution. The app can compose a scientifically sensible session and calculate a review date, but the current learner-facing path mainly turns that plan into Home receipts and explanatory copy. It does not run the planned blocks, count their stopping conditions, make a delayed probe happen, tell the player that today’s useful dose is complete, or protect consolidation. With one month at a Yamaha DTX402, that gap matters more than another ranking heuristic.

| verdict  | count |
| -------- | ----: |
| EMBODIED |     3 |
| PARTIAL  |     6 |
| MISSING  |     2 |

This is a code audit of the requested feat/practice-loop snapshot and the live shared worktree read on 2026-08-14. It is not a claim that Drumroll has been shown to improve drumming faster than a control condition. The relevant outcome has not been measured: next-day, target-tempo, changed-context DTX performance.

### scope and standard

An **EMBODIED** principle changes the learner’s actual task, feedback, progression, or stored evidence. A design document, unit test, ranking factor, or explanatory string alone does not qualify. **PARTIAL** means a real behavior exists but misses a condition that the research makes decision-relevant. **MISSING** means there is no learner-facing mechanism in the audited path.

The audit uses code as the source of truth. [pedagogy-engine-v2.md](pedagogy-engine-v2.md) contains several sound intentions, including planned dose and delayed retrieval; it does not prove that the running app enforces them.

## pass 1 — what the science supports

### 1. learning is retention and transfer, not a good-looking practice run

Motor learning has to be measured after time and in a meaningful changed condition. A strong run can be transient performance supported by recent repetition, a permissive timing window, or the exact same phrase. Sleep research makes this distinction operational: a meta-analysis of 48 studies found a positive overall sleep-related effect on motor-memory consolidation, while task type and protocol mattered; a controlled study found both acquisition and consolidation depend on sleep and circadian state. A useful corrective is that sleep may stabilize a motor memory rather than create a free performance boost. [1](https://doi.org/10.1016/j.neubiorev.2020.07.028) [2](https://doi.org/10.1093/sleep/zsx036) [3](https://doi.org/10.1523/JNEUROSCI.1236-14.2015)

Product implication: reward a same-day run as acquisition evidence, then ask for a delayed same-context probe and a changed-context probe before claiming retention or transfer. Do not manufacture a universal sleep rule or a magic practice duration; the evidence does not warrant one.

### 2. dose, spacing, and retrieval beat undifferentiated same-session grinding

In a small healthy-adult serial-reaction-time study, three sessions separated by 12 hours, including sleep, produced better acquisition than three sessions separated by 10 minutes. This is task-specific evidence, not a prescription that every drummer must use exactly 12-hour gaps. It does support short, repeated, skill-specific returns over a long automatic loop. [4](https://doi.org/10.1589/jpts.27.769)

The useful product rule is therefore: cap a local repetition set once it has yielded its planned evidence; surface the skill again after a delay; use the later attempt as the score that matters. A schedule should adapt to prior evidence and real attendance. Tue/Thu/Sat is a calendar preference, not a consolidation policy.

### 3. the right difficulty depends on the drummer and the task

The challenge-point framework says useful information in practice depends on nominal task difficulty and the learner’s current skill. A task that is productive for one drummer can be either empty repetition or noise for another. [5](https://doi.org/10.3200/JMBR.36.2.212-224)

For music, task-specific structured practice relates strongly to objectively assessed musical achievement, but it is not a one-variable explanation of expertise. Platz et al. report a corrected association of r = 0.61 across 13 music studies, and the paper itself warns against treating generic accumulated hours as the thing that matters. [6](https://doi.org/10.3389/fpsyg.2014.00646)

Product implication: choose a concrete phrase, target tempo, and one skill demand; state what counts as a quality repetition; preserve free play. A global song difficulty, a streak, or XP cannot substitute for that.

### 4. feedback should help attention and diagnosis without creating score dependence

Augmented feedback can improve motor learning, but the evidence does **not** support the folk rule that immediate feedback is always bad or summary feedback is always better. Feedback format, task, learner, and outcome matter; the broad review evidence is heterogeneous. [7](https://doi.org/10.7759/cureus.19695)

The stronger current signal for product design is control: a 2025 meta-analysis of 29 studies and 1,147 participants found no significant self-controlled-feedback advantage during acquisition, but an advantage in retention and transfer relative to passively received feedback. [8](https://doi.org/10.3390/bs15091291)

The defensible inference for drumming is a two-layer channel:

- while playing: fast, low-verbal external information such as timing/target visibility and the sound of the result;
- at a phrase boundary or on request: one diagnostic action, a replay, or a clear error explanation;
- as evidence stabilizes: less compulsory explanation and more learner-requested detail.

Do not narrate every strike. Do not hide the reason for a correction. Do not force a tempo change before the drummer can choose it.

### 5. contextual interference and desirable difficulty are conditional

The largest current systematic review/meta-analysis found a transfer advantage for higher contextual interference on average, but the applied-setting estimate was small and non-significant, and effects varied by task and design. [9](https://doi.org/10.3389/fpsyg.2024.1377122) Random variation is not a novice policy.

The closest controlled music-motor evidence is more cautionary. In a novice piano-sequence experiment, lower tempo variability and a non-random tempo schedule improved motor transfer to new tempi and sequences; timing and movement outcomes dissociated. [10](https://doi.org/10.1371/journal.pone.0193580) A music-practice study of advanced performers also treats blocked versus interleaved schedules as an empirical question rather than a universal rule. [11](https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/)

The fresh search did not produce a strong percussion-specific controlled result that justifies a hard drum-set randomization rule. It found music-instrument studies and an indirect reference to a university snare-drum study, not enough to dictate a production policy. Drumroll should therefore use blocked acquisition first, then a small controlled change — adjacent bar, groove return, nearby tempo, or another song with the same demand — and measure the transfer result on the DTX402.

### 6. slow practice is a tool, not proof of fast playing

Slow tempo reduces coordination demand and can make an error observable. It does not establish that the movement survives at song tempo. The piano evidence above is enough to reject a generic slow-practice-transfer claim: tempo variability, order, motor smoothness, and timing can move differently. [10](https://doi.org/10.1371/journal.pone.0193580)

Product implication: every slow loop needs an explicit target-tempo probe. A useful ladder changes one condition at a time, logs the actual speed, and separates a passing score at 0.7× from evidence at 1.0×.

### 7. motivation is a learning-rate input, not decoration

Self-determination theory is best used here as a design constraint, not a gamification slogan. A systematic review of 66 physical-activity studies found consistent links between autonomous motivation, competence satisfaction, and participation; intrinsic regulation related more to long-term adherence. The evidence transfers imperfectly from exercise to drumming, but the mechanism is relevant to a month-long kit practice habit. [12](https://doi.org/10.1186/1479-5868-9-78)

For Drumroll:

- autonomy means a real choice of goal, song, tempo, feedback depth, and whether to continue;
- competence means credible evidence that distinguishes improvement from a lucky or assisted run;
- relatedness means a meaningful human or social loop, which is not present in the audited practice path.

XP and streaks can support attendance only after the task is useful. They become harmful when they reward one more automatic loop after the learning signal has flattened.

## pass 2 — what the app actually does

### task choice and difficulty

src/renderer/services/next-practice/recommend.ts calls rankZpdFrontier with skill states and due reviews. src/renderer/services/pedagogy/zpd-frontier.ts estimates predicted success from skill fit, prerequisites, tempo fit, transfer fit, and uncertainty; it identifies assessment, productive acquisition, productive consolidation, scaffold-first, too-easy, and goal-preview states. It ranks ZPD fit, goal bottleneck reduction, due retention, transfer, preference, uncertainty, and recent same-task fatigue.

That is a genuine learner-relative policy. Its weights are hand-authored, however. There is no calibration loop showing that a predicted 75% success rate produces better next-day DTX learning than a 60% or 90% alternative.

### session construction versus session execution

src/renderer/services/pedagogy/session-composer.ts can construct orient, acquire, apply, retain, transfer, and celebrate blocks. Its stop rules are useful on paper:

- orient: one counted phrase;
- acquire: two quality or two low-quality passes;
- apply: one musical phrase or section;
- retain: one delayed retrieval probe;
- transfer: one different-context phrase.

The critical implementation fact: SessionBlock.stop_rule is a string. The only production caller found for composePracticeSession is src/renderer/services/next-practice/home-session.ts; it turns the plan into launch, focus, build, and payoff receipts. No session runner was found that tracks block completion, transitions the learner to the next block, or stops play when the rule is met.

The app also has a weekly rhythm in src/renderer/services/pedagogy/engagement.ts, but it marks daily practice or a fixed Tue/Thu/Sat schedule as planned/rest. It is not driven by current skill evidence, sleep, fatigue, a completed dose, or an actual next-day retrieval task.

### in-play feedback

src/renderer/services/practice-stats/compute.ts records hit/miss/wrong-pad counts, lane accuracy, timing bias/spread, and speed. src/renderer/services/adaptive-practice/adaptive-timing.ts adapts the scoring window from recent runs: it gets more forgiving after weak accuracy/high spread and tightens only after at least three strong, near-full-speed runs.

The adaptive window is considerate, but it changes the judgement tolerance rather than the musical task. It needs a later fixed-tolerance probe so a more forgiving score cannot feel like equal motor learning.

The learner-facing Tutor does not explain every hit. src/renderer/hooks/useTutorSession.ts waits for material patterns and acts at measure/recovery boundaries. src/renderer/components/TutorHud/TutorHud.tsx provides one focused repair and a collapsed Why disclosure grounded in actual scoreable mistake data. That is a good information-density choice.

The Tutor preserves learner-owned tempo: its command executor moves the playhead but never calls engine.setPlaybackSpeed; a suggested speed remains a suggestion. The current product profile in src/renderer/services/tutor/types.ts also uses two clean repetitions, preserves partial progress, and caps failed recovery at one attempt so the learner returns to the song rather than being trapped in a loop.

### error recovery and remediation

The error loop is real, bounded, and unusually good:

- src/renderer/services/tutor/checkpoints.ts includes a lead-in and one bar after the failed region;
- src/renderer/services/tutor/machine.ts sends a clean anchor into a real subsequent-bar return context before resume;
- src/renderer/services/remediation/remediation.ts makes a 1–4-bar queue from Coach findings, requires two good-enough passes, preserves a near miss rather than resetting progress, and changes to a nearby tempo after the first clean anchor;
- src/renderer/hooks/useRemediationSession.ts records each completed loop from real transport events, not from a guessed timer.

The limits matter. The product avoids a punitive infinite loop. The remaining gap is a delayed return: completed remediation currently clears the phrase and reopens Coach; it does not create an automatic next-day recall task or a target-tempo transfer test.

### post-run feedback and continuation

src/renderer/components/ScoreSummary/ScoreSummary.tsx presents the end-of-run summary, an optional Coach route, and expanded Practice Stats. That is compatible with summary feedback.

There is an active conflict with autonomy and reflection. src/renderer/views/SongView/SongView.tsx defaults settings.autoContinueEnabled to true. For a saved, non-lesson Practice run, ScoreSummary starts a cancellable eight-second countdown and calls onNextSong. The learner can cancel, but the default action begins another task before they have deliberately inspected the evidence or chosen the next move.

There is a second conflict in the Coach path. applyCoachLoop calls applyCoachSpeed, which immediately calls setPlaybackSpeed(speed) before the loop starts. A later control lets the player restore their own speed, but the first experience is an imposed tempo. That differs from the Tutor’s better learner-owned policy.

### retention, transfer, and mastery data

src/renderer/services/pedagogy/skill-state.ts has a 24-hour retention boundary. It labels a qualifying same-context event after that boundary as retention and a qualifying changed-context event after a retained state as transfer. A skill becomes provisional after two qualifying events in a context, retained after retention evidence, and transferable after transfer evidence. src/renderer/services/pedagogy/review-scheduler.ts derives a 1/3/7/14/28-day review cadence from the skill graph.

That is real learning-state machinery. It is not a fully delivered learning loop:

- the Home session caller does not pass explicit due reviews into composePracticeSession;
- due reviews can influence the ranking upstream, but the learner is not reliably launched into a named recall probe;
- the composer can describe retain/transfer blocks, but no runner executes them;
- src/renderer/services/lesson-progression.ts allows curriculum progression after one uninterrupted, full-coverage practice run at 0.7× and 82% accuracy. The code correctly describes this as the next learning step rather than concert mastery, but it still needs a later target-speed, delayed proof before a competence surface treats it as learned.

src/renderer/services/mastery/mastery.ts time-decays full-speed accuracy, consistency, speed readiness, coverage, and lane readiness over a retention window. This is a better report than a single high score. It is still an aggregate estimate over runs, not a pre-registered delayed target task. It cannot tell whether a player learned a clean stroke, posture, rebound, stickings on a single-lane input, acoustic tone, or injury-safe technique.

### motivation

The app supports autonomy in several places: free song choice, explicit goals, likes, a manual speed control, an optional Coach, and a Tutor that does not force tempo. It supports competence through useful error evidence, a visible recovery receipt, and an honest persistence boundary before XP/rewards.

Relatedness is missing from the audited practice path. There is no teacher review, peer accountability, band rehearsal target, or social feedback loop. This is not the first change to build for a one-month solo-kit goal, but it means the SDT claim is incomplete.

## pass 3 — hostile per-principle verdict

| principle                                             | code-backed learner behavior                                                                                                                                                                                                | verdict      | why this is the right harsh judgement                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| learner-relative challenge                            | ZPD ranking combines current atomic states, prerequisites, tempo, transfer, uncertainty, goal bottleneck, preference, and same-task fatigue in zpd-frontier.ts; the result changes candidate and scaffold choice.           | **EMBODIED** | This actually changes what the learner is asked to play. The coefficients are not calibrated against later learning, so do not call the predicted-success number scientifically validated.                                         |
| bounded, specific remediation                         | Tutor detects repeated material failure, rewinds with lead-in/context, holds partial progress, and returns to a subsequent bar. Coach remediation creates a measured 1–4-bar two-pass loop with a nearby-tempo second pass. | **EMBODIED** | This is deliberate practice in behavior: one identifiable error, a bounded repair, and actual observed repetitions. The one-failed-recovery safety cap is humane, though it can defer an unresolved error too early.               |
| acquisition versus retention versus transfer evidence | skill-state.ts uses a 24-hour boundary and context signatures; stages distinguish provisional, retained, and transferable.                                                                                                  | **EMBODIED** | The code refuses to equate a fresh run with durable competence. Its weakness is delivery: the app does not yet make the required probes reliably happen.                                                                           |
| deliberate-practice session structure                 | session-composer.ts describes orient/acquire/apply/retain/transfer/celebrate blocks and useful stop rules. home-session.ts turns them into receipts.                                                                        | **PARTIAL**  | A composition is not a practice protocol until it controls the player’s actual block, evidence, transition, and stop. This is currently a plan-shaped narrative.                                                                   |
| feedback timing, frequency, and learner control       | Tutor gives phrase-boundary interventions and an optional Why disclosure; Score Summary and Coach are post-run. Coach loops auto-apply tempo; auto-continue defaults on.                                                    | **PARTIAL**  | The app avoids constant verbal interruption and exposes grounded detail. It still mixes a good Tutor autonomy policy with forced Coach tempo and automatic continuation.                                                           |
| distributed practice and retrieval                    | Skills have a 1/3/7/14/28-day schedule; due reviews can affect ZPD ranking. Weekly rhythm is fixed calendar logic.                                                                                                          | **PARTIAL**  | Scheduling exists as data. A named, delayed retrieval task is not reliably delivered, executed, or completed in the practice surface.                                                                                              |
| tempo scaling and the speed–accuracy trade-off        | A slow scaffold can be recommended; remediation changes tempo once after an anchor; scoring windows tighten only after strong near-full-speed evidence.                                                                     | **PARTIAL**  | Tempo is tracked and sometimes adapted. There is no executed tempo ladder, target-speed probe requirement, or evidence that a slow pass has transferred. Guided Tutor sets speedStep to zero, so it does not itself advance tempo. |
| contextual interference and transfer                  | Session composer can describe apply/transfer; Tutor carries a clean repair into one real next bar; atomic states can recognize a changed context.                                                                           | **PARTIAL**  | There is a correct small-context transfer behavior. There is no controlled blocked-to-variable schedule, no choice of variation magnitude by readiness, and no outcome check that validates the policy on drummers.                |
| autonomy, competence, and relatedness                 | Goal/song/tempo choice, visible evidence, optional Coach, Tutor-owned tempo preservation, XP/streaks after persistence; no human feedback loop.                                                                             | **PARTIAL**  | Autonomy and competence are substantive, then undercut by Coach auto-tempo and automatic continuation. Relatedness is absent.                                                                                                      |
| session dose, breaks, and fatigue                     | Same-item fatigue is a ranking penalty; early exits can choose a shorter plan. Stop rules are strings; there is no executing session timer, block counter, or break rule.                                                   | **MISSING**  | The app cannot tell the player that a useful dose is done, insert a break, or prevent a flat, massed continuation loop.                                                                                                            |
| sleep-dependent consolidation                         | No learner-facing sleep, recovery, or after-practice consolidation behavior was found in the audited pedagogy, next-practice, Home, or SongView paths.                                                                      | **MISSING**  | The weekly calendar’s rest label is not consolidation support. The app should not make sleep claims until it actually changes scheduling or guidance around the next retrieval opportunity.                                        |

## changes ranked by expected learning-rate impact

Rank is for a one-month DTX402 goal, not for engineering convenience. The first three remove active distortions before adding theory theatre.

### 1. make the session plan executable, then end it

Replace SessionBlock.stop_rule strings with typed completion criteria: phrase/loop range, required scored notes, quality threshold, maximum low-quality attempts, and a block-level time cap. Add a small session runner that receives real SongView phrase/loop events, advances only when evidence meets the block condition, and shows a clear finish state after the planned blocks.

Concrete acceptance:

- a short session runs orient → acquire/retrieve → celebrate and cannot silently drift into a fourth unplanned loop;
- a standard session records apply plus one transfer or delayed-retrieval block;
- the finish state offers bank today’s gain and names the next review, rather than auto-starting another item;
- the event record carries block role and evidence outcome.

Primary files: session-composer.ts, pedagogy/types.ts, home-session.ts, and SongView.tsx.

### 2. make target-tempo delayed proof the competence gate

Keep the current 0.7×/82% lesson clear as a non-blocking curriculum unlock if desired. It must never be the evidence behind learned, retained, mastery, or ready-to-perform language.

After a qualifying acquisition pass:

1. create a same-phrase retrieval task at least 24 hours later, at authored target speed and a fixed standard timing window;
2. if that qualifies, create one changed-context probe: adjacent bar/groove return, same skill in another song, or a nearby tempo;
3. store acquisition, retention, and transfer separately in the UI and ranking;
4. use target-tempo delayed performance as the primary success metric for model tuning.

This converts the existing skill-state taxonomy from honest bookkeeping into a learning loop.

### 3. unify feedback around a learner-owned phrase boundary

Keep the Tutor’s current one-focused-repair and optional Why disclosure. Change the Coach path so a suggested tempo appears as an explicit action such as try 0.7×, rather than changing playback before the learner agrees. Put a requestable replay/slowdown control next to the explanation, then fade compulsory detail as two clean passes accumulate.

Also set automatic continuation off by default for learning sessions. A deliberate one-kick or click can still continue hands-free. The user should choose after seeing the receipt; cancelling an eight-second countdown is not the same thing.

Concrete acceptance:

- no feedback message is generated per strike;
- every forced rewind has one evidence-grounded reason and one user-initiated detail route;
- no code path calls setPlaybackSpeed from a Coach recommendation without an explicit learner action;
- the learner can continue, retry, inspect, or finish without a default timer choosing for them.

### 4. use a controlled tempo ladder with a target probe

Treat tempo as a task condition, not a scalar score bonus. For a fixed phrase, keep tempo stable for two quality passes. Then offer one learner-approved 5–10% increase or decrease, depending on the evidence. After a stable near-target pass, test the target tempo with the normal timing window. Only after that should the engine claim a speed gain.

Use a second condition only after the anchor: a nearby tempo _or_ an adjacent musical context, not random chaos. Carry speed and timing window in every event. The present Tutor recommendation and remediation tempo variation supply the pieces; the missing part is an executed sequence and a target test.

### 5. deliver spaced returns and recovery as actions, not ranking trivia

At the end of a finished session, schedule the next named skill retrieval from the existing 1/3/7/14/28-day state. When the app opens, put an overdue review ahead of generic novelty unless the learner deliberately chooses another goal. If several low-quality blocks occur, finish the local dose, preserve the evidence, and bring it back later rather than recycling it automatically.

Add a short recovery cue only where the app can act honestly: for example, this phrase is banked; return tomorrow for the recall check. Do not diagnose sleep, posture, injury risk, or physiology from MIDI. The first validation metric is next-day target-tempo performance, not time spent.

## what to stop doing now

1. **stop defaulting to automatic continuation after a saved practice run.** autoContinueEnabled is true by default and starts the next non-lesson practice item after eight seconds. This rewards continuation before reflection, choice, or consolidation.

2. **stop auto-applying Coach tempo.** applyCoachLoop changes playback before the player decides. The Tutor already demonstrates the better policy: recommend, explain, and let the drummer keep or change their speed.

3. **stop treating a 0.7× same-session lesson clear as competence evidence.** The current code is careful in comments, but every visible label, reward, and recommendation must keep it in the acquisition lane until a delayed target-tempo probe exists.

4. **stop calling a composed plan a learning session.** Until block completion and stop rules execute in the practice surface, it is a good recommendation card, not dose control, spaced retrieval, or deliberate-practice delivery.

## minimum proof that the next version actually learns faster

Do not tune this by taste. Run an opt-in within-drummer comparison on the Yamaha DTX402:

- baseline: current practice flow;
- intervention: executable session runner, learner-approved tempo ladder, and scheduled next-day probe;
- primary outcome: percentage of target-tempo, fixed-window next-day retrieval probes passed;
- secondary outcomes: changed-context probe pass rate, time-to-first retained skill, voluntary return rate, and forced-recovery/deferred-recovery rate;
- guardrail: no drop in free-play completion or a rise in repeated low-quality loops.

That creates the only evidence that matters for the owner’s goal: more retained, transferable drumming per hour at the kit.

## sources

1. Schmid, D., Erlacher, D., Klostermann, A., Kredel, R., & Hossner, E.-J. (2020). _Sleep-dependent motor memory consolidation in healthy adults: A meta-analysis._ **Neuroscience & Biobehavioral Reviews, 118**, 270–281. https://doi.org/10.1016/j.neubiorev.2020.07.028

2. Tucker, M. A., Morris, C. J., Morgan, A., Yang, J., Myers, S., Garcia Pierce, J., Stickgold, R., & Scheer, F. A. J. L. (2017). _The relative impact of sleep and circadian drive on motor skill acquisition and memory consolidation._ **Sleep, 40**(4), zsx036. https://doi.org/10.1093/sleep/zsx036

3. Nettersheim, A., Hallschmid, M., Born, J., & Diekelmann, S. (2015). _The role of sleep in motor sequence consolidation: stabilization rather than enhancement._ **Journal of Neuroscience, 35**(17), 6696–6702. https://doi.org/10.1523/JNEUROSCI.1236-14.2015

4. Kwon, Y. H., Kwon, J. W., & Lee, M. H. (2015). _Effectiveness of motor sequential learning according to practice schedules in healthy adults; distributed practice versus massed practice._ **Journal of Physical Therapy Science, 27**(3), 769–772. https://doi.org/10.1589/jpts.27.769

5. Guadagnoli, M. A., & Lee, T. D. (2004). _Challenge point: a framework for conceptualizing the effects of various practice conditions in motor learning._ **Journal of Motor Behavior, 36**(2), 212–224. https://doi.org/10.3200/JMBR.36.2.212-224

6. Platz, F., Kopiez, R., Lehmann, A. C., & Wolf, A. (2014). _The influence of deliberate practice on musical achievement: a meta-analysis._ **Frontiers in Psychology, 5**, 646. https://doi.org/10.3389/fpsyg.2014.00646

7. Moinuddin, A., Goel, A., & Sethi, Y. (2021). _The role of augmented feedback on motor learning: a systematic review._ **Cureus, 13**(11), e19695. https://doi.org/10.7759/cureus.19695

8. Wang, B., Tao, T., Yuan, Y., & Guo, W. (2025). _Self-controlled feedback and behavioral outcomes in motor skill learning: a meta-analysis._ **Behavioral Sciences, 15**(9), 1291. https://doi.org/10.3390/bs15091291

9. Czyż, S. H., Wójcik, A., & Solarská, M. (2024). _The effect of contextual interference on transfer in motor learning: a systematic review and meta-analysis._ **Frontiers in Psychology, 15**, 1377122. https://doi.org/10.3389/fpsyg.2024.1377122

10. Caramiaux, B., Bevilacqua, F., Wanderley, M. M., & Palmer, C. (2018). _Dissociable effects of practice variability on learning motor and timing skills._ **PLOS ONE, 13**(3), e0193580. https://doi.org/10.1371/journal.pone.0193580

11. Carter, C. E., & Grahn, J. A. (2016). _Optimizing music learning: exploring how blocked and interleaved practice schedules affect advanced performance._ **Frontiers in Psychology, 7**, 1251. https://doi.org/10.3389/fpsyg.2016.01251

12. Teixeira, P. J., Carraça, E. V., Markland, D., Silva, M. N., & Ryan, R. M. (2012). _Exercise, physical activity, and self-determination theory: a systematic review._ **International Journal of Behavioral Nutrition and Physical Activity, 9**, 78. https://doi.org/10.1186/1479-5868-9-78
