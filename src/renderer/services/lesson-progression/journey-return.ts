import { LessonUnitGroup } from '../../hooks/useLessons';

export interface JourneyReturnTarget {
  unit: string;
  lessonId: string;
}

export function journey_return_target(
  groups: readonly LessonUnitGroup[],
  unit: string | undefined,
  lessonId: string | undefined,
): JourneyReturnTarget | undefined {
  if (!unit || !lessonId) {
    return undefined;
  }

  const group = groups.find((candidate) => candidate.unit === unit);
  const lessonIndex = group?.entries.findIndex(
    (entry) => entry.song.id === lessonId,
  );

  if (!group || lessonIndex === undefined || lessonIndex < 0) {
    return undefined;
  }

  const next = group.entries
    .slice(lessonIndex + 1)
    .find((entry) => entry.unlocked);
  const current = group.entries[lessonIndex];

  if (!next && !current?.unlocked) {
    return undefined;
  }

  return { unit, lessonId: next?.song.id ?? current.song.id };
}
