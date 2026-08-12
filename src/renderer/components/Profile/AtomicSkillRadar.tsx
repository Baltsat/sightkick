import {
  ATOMIC_SKILL_GRAPH,
  AtomicSkillState,
  skillConfidence,
  skillNodeById,
  skillProbability,
} from '../../services/pedagogy';

const CENTER_X = 220;
const CENTER_Y = 174;
const OUTER_RADIUS = 92;
const LABEL_RADIUS = 138;
const STAGE_LABEL: Record<AtomicSkillState['stage'], string> = {
  unknown: 'Not measured',
  assessed: 'Assessed',
  provisional: 'Provisional',
  retained: 'Retained',
  transferable: 'Transferable',
};

interface RadarSkill {
  id: string;
  label: string;
  state: AtomicSkillState | undefined;
}

function point(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;

  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function polygon(points: readonly { x: number; y: number }[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function labelLines(label: string): readonly string[] {
  const words = label.split(' ');

  if (words.length <= 2) {
    return [label];
  }

  const split = Math.ceil(words.length / 2);

  return [words.slice(0, split).join(' '), words.slice(split).join(' ')];
}

function stageValue(state: AtomicSkillState | undefined): number {
  if (!state || state.stage === 'unknown') {
    return 0;
  }

  return skillProbability(state) * skillConfidence(state);
}

function selectedSkills(
  states: readonly AtomicSkillState[],
  focusSkillIds: readonly string[],
): readonly RadarSkill[] {
  const byId = skillNodeById();
  const statesById = new Map(states.map((state) => [state.skill_id, state]));
  const ids = [
    ...focusSkillIds,
    ...states
      .filter((state) => state.stage !== 'unknown')
      .sort(
        (left, right) =>
          right.effective_trials - left.effective_trials ||
          left.skill_id.localeCompare(right.skill_id),
      )
      .map((state) => state.skill_id),
    ...ATOMIC_SKILL_GRAPH.map((skill) => skill.id),
  ];

  return [...new Set(ids)]
    .map((id) => {
      const skill = byId.get(id);

      return skill && skill.evidence_boundary !== 'unsupported'
        ? { id, label: skill.label, state: statesById.get(id) }
        : undefined;
    })
    .filter((skill): skill is RadarSkill => skill !== undefined)
    .slice(0, 6);
}

export function AtomicSkillRadar({
  states,
  focusSkillIds,
}: {
  states: readonly AtomicSkillState[];
  focusSkillIds: readonly string[];
}) {
  const skills = selectedSkills(states, focusSkillIds);
  const vertices = skills.map((skill, index) =>
    point(index, skills.length, OUTER_RADIUS * stageValue(skill.state)),
  );
  const outer = skills.map((_, index) =>
    point(index, skills.length, OUTER_RADIUS),
  );

  return (
    <section
      className="border-t border-border-soft pt-5"
      data-testid="atomic-skill-profile"
      aria-labelledby="atomic-skill-profile-title"
    >
      <div>
        <h3
          id="atomic-skill-profile-title"
          className="font-display text-2xl font-semibold tracking-[-0.03em] text-text"
        >
          Skill map
        </h3>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-text-muted">
          Six skills closest to the current target. Blank means we have not
          measured it yet.
        </p>
      </div>

      <figure
        className="mx-auto mt-2 w-full max-w-110"
        data-testid="atomic-skill-radar"
      >
        <svg
          className="h-auto w-full overflow-visible"
          viewBox="0 0 440 350"
          role="img"
          aria-labelledby="atomic-skill-profile-title atomic-skill-radar-caption"
        >
          {[0.33, 0.66, 1].map((scale) => (
            <polygon
              key={scale}
              points={polygon(
                skills.map((_, index) =>
                  point(index, skills.length, OUTER_RADIUS * scale),
                ),
              )}
              fill="none"
              stroke="var(--line-soft)"
              strokeWidth="1"
            />
          ))}
          {outer.map((end, index) => (
            <line
              key={skills[index].id}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={end.x}
              y2={end.y}
              stroke="var(--line-soft)"
              strokeWidth="1"
            />
          ))}
          <polygon
            points={polygon(vertices)}
            fill="color-mix(in srgb, var(--signal-wine) 20%, transparent)"
            stroke="var(--signal-wine)"
            strokeWidth="2"
          />
          {vertices.map((vertex, index) => (
            <circle
              key={skills[index].id}
              cx={vertex.x}
              cy={vertex.y}
              r="3"
              fill="var(--signal-wine)"
            />
          ))}
          {skills.map((skill, index) => {
            const label = point(index, skills.length, LABEL_RADIUS);
            const anchor =
              label.x < CENTER_X - 20
                ? 'end'
                : label.x > CENTER_X + 20
                ? 'start'
                : 'middle';

            return (
              <text
                key={skill.id}
                x={label.x}
                y={label.y}
                fill="var(--ink-strong)"
                fontSize="11"
                fontWeight="600"
                textAnchor={anchor}
              >
                {labelLines(skill.label).map((line, lineIndex) => (
                  <tspan key={line} x={label.x} dy={lineIndex === 0 ? 0 : 13}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
        <figcaption id="atomic-skill-radar-caption" className="sr-only">
          Skill map drawn from saved practice.
        </figcaption>
      </figure>

      <dl
        className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2"
        data-testid="atomic-skill-text-alternative"
      >
        {skills.map((skill) => {
          const confidence = Math.round(skillConfidence(skill.state) * 100);

          return (
            <div
              key={skill.id}
              className="border-b border-border-soft pb-3 text-sm"
            >
              <dt className="font-semibold text-text">{skill.label}</dt>
              <dd className="mt-1 flex flex-wrap gap-x-2 text-text-muted">
                <span>{STAGE_LABEL[skill.state?.stage ?? 'unknown']}</span>
                <span aria-hidden="true">·</span>
                <span>{confidence}% measured</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
