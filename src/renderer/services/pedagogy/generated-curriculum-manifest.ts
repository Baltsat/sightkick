import generated_manifest from './generated-curriculum-manifest.json';
import type { ItemSkillManifest } from './types';

export const GENERATED_CURRICULUM_MANIFEST_SOURCE_REVISION =
  generated_manifest.source_revision;

export const GENERATED_CURRICULUM_ITEM_MANIFESTS: readonly ItemSkillManifest[] =
  generated_manifest.items as readonly ItemSkillManifest[];
