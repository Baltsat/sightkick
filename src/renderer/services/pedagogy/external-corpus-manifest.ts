import { validateItemSkillManifest } from './item-manifest';
import type { ItemSkillManifest } from './types';

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);

  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

export function externalCorpusItemManifest(
  itemId: string,
  encoded: string | undefined,
): ItemSkillManifest | undefined {
  if (!encoded) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(decodeBase64Url(encoded)) as ItemSkillManifest;

    return manifest.item_id === itemId &&
      validateItemSkillManifest(manifest).valid
      ? manifest
      : undefined;
  } catch {
    return undefined;
  }
}
