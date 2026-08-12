# Adaptive tutor research notes

## Purpose

These notes connect motor-learning evidence to Drumroll product rules.
They do not claim that one fixed algorithm is optimal for every drummer.

Drumroll must keep each decision visible and testable.
The first release uses deterministic rules.
Later releases can compare those rules with measured retention and transfer.

## Evidence and product implications

### Match task difficulty to current skill

Guadagnoli and Lee describe a challenge-point framework for motor learning.
The useful challenge depends on both task difficulty and performer skill.

Source: https://pubmed.ncbi.nlm.nih.gov/15130871/

Product implication:

- Recommend work that is neither already stable nor far beyond the player.
- Estimate challenge from prerequisites, tempo, density, coordination, and recent evidence.
- Show why the app selected the item.
- Reduce tempo or pattern length before abandoning a useful challenge.

The 2025 scoping review reports broad use of the framework and limited practical application evidence.
Drumroll must treat its thresholds as testable product hypotheses.

Source: https://pubmed.ncbi.nlm.nih.gov/40568842/

### Adapt feedback frequency to complexity and skill

One study found better retention with self-controlled or moderate-frequency result feedback.

Source: https://pubmed.ncbi.nlm.nih.gov/34338053/

Other studies found that frequent feedback can help with complex tasks.
An experiment with children also found an interaction between task difficulty and feedback frequency.

Sources:

- https://pubmed.ncbi.nlm.nih.gov/20037033/
- https://pubmed.ncbi.nlm.nih.gov/22421736/

Product implication:

- Keep immediate hit-state feedback available during complex novice work.
- Do not interrupt the player for every isolated error.
- Use a musical error window before automatic recovery.
- Reduce coaching frequency as a pattern becomes stable.
- Let the player request more or less coaching.

### Preserve normal auditory mapping

A piano study with novices found more sequence errors under random pitch feedback.
Normal or fixed-pitch feedback produced fewer sequence errors.

Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC6261582/

Product implication:

- Preserve the kit's normal sound and song relationship.
- Keep UI sounds short and subordinate to musical audio.
- Never remap kit hits to arbitrary feedback tones during scored practice.

### Use tempo variation after basic stability

A musical motor study separated timing learning from movement-sequence learning.
It tested tempo amount and tempo schedule as different practice variables.

Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC5832267/

Product implication:

- First stabilize the target pattern at a reachable speed.
- Then vary tempo in bounded steps to test transfer.
- Track movement correctness and timing stability as separate signals.
- Do not treat one accuracy value as full mastery.

### Space practice and test retention

Several controlled motor-skill studies found benefits from distributed practice.
They also show that the best spacing interval depends on the task and study design.

Sources:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4395711/
- https://pmc.ncbi.nlm.nih.gov/articles/1856544/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9170220/

Product implication:

- Schedule weak skills again after a delay.
- Do not spend a whole session on one repeated pattern.
- Add a later retention check before marking a skill stable.
- Track acquisition, retention, and transfer as separate evidence.

### Personalize the item and the learner estimate

Duolingo describes Birdbrain as a model that estimates learner skill and item difficulty.
Its session generator uses those estimates to select useful work.

Source: https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/

Product implication:

- Keep a separate mastery estimate for the player.
- Keep a separate difficulty description for each song and lesson.
- Use both values in the next-best-practice score.
- Start with explainable heuristics before a learned model has enough data.

## First-release tutor rules

### Error window

The tutor evaluates resolved judgements over musical bars.
It does not use raw visual miss events.

The first rule checks the last two completed bars. Every branch first needs the
configured minimum number of resolved chart-note outcomes (four by default).
Recovery can start only when one of these bounded patterns is true:

- at least three distinct scoreable errors and less than 80 percent accuracy,
- two unambiguous, matched wrong-pad pairs on the same actual-pad to
  expected-pad transition,
- the same bar has the configured weak evidence on two passes of the current
  session,
- timing spread remains above the configured threshold with enough hit samples
  and more than one timing extreme.

Wrong hits are paired only with one uniquely close missed expected note in the
same bar. Ambiguous chord misses, warm-up taps, a single timing outlier, and one
isolated miss do not interrupt the song. Same-bar history is reducer-owned and
resets for every new run.

### Recovery block

The tutor starts at the closest safe checkpoint before the first material error.
It includes one lead-in bar when the chart allows it.

The first recovery uses the current speed.
After a repeated failure, the tutor reduces speed by 10 percent.
The tutor never goes below the configured speed floor.

The player exits recovery after the configured number of clean repetitions.
A clean repetition uses an explicit predicate: minimum resolved notes, minimum
accuracy, and configured maximum miss and wrong-hit counts (defaults: two
repetitions, four resolved notes, at least 90 percent accuracy, zero misses,
and zero wrong hits). The HUD repeats that predicate and the configured maximum
failed-recovery-attempt deferral limit rather than relying on hidden constants.

These values are initial product thresholds.
They need real-session evaluation and can change without a schema migration.

### Feedback schedule

The app always renders hit state during play.
The app only shows a blocking coaching message at a recovery boundary.

For a new or difficult pattern, the message can appear after every failed recovery attempt.
For a stable pattern, the app shows a summary after several passes or on request.

### Recommendation score

Each candidate receives a transparent score from these terms:

- prerequisite readiness,
- skill gap,
- lane gap,
- speed gap,
- due-for-retention value,
- preference value,
- novelty value,
- fatigue penalty,
- recent-failure penalty when the item is too difficult.

The UI displays the strongest positive term as the recommendation reason.

## Validation plan

The local session history must support these checks:

1. Did recovery improve the next pass in the same session?
2. Did the player retain the pattern after one day and one week?
3. Did the player transfer the skill to another tempo or song?
4. Did the tutor cause too many interruptions?
5. Did the player disable or override the tutor?
6. Did the next-best task remain inside a useful accuracy band?

The product can tune rules only after it has enough complete records.
Legacy summary-only runs do not support bar-level tutor evaluation.
