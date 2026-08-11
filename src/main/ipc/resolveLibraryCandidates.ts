import type { IpcMainEvent } from 'electron';
import type {
  IpcResolveLibraryCandidatesRequest,
  IpcResolveLibraryCandidatesResponse,
  LibraryCandidateResolution,
  LibrarySourceTrackProvenance,
  PublicDrumChartCandidate,
} from '../../types';
import { normalizeLibrarySourceProvenance } from '../../library-sources/provenance';
import { resolvePublicDrumCharts } from '../../library-sources/playability';

type JsonRecord = Record<string, unknown>;

type CatalogSearch = (
  source: LibrarySourceTrackProvenance,
) => Promise<PublicDrumChartCandidate[]>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' ? (value as JsonRecord) : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed > 10_000 ? parsed / 1000 : parsed;
}

function nonNegativeNumber(value: unknown): boolean {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number(value)
      : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0;
}

function approved(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function artists(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const name = string(entry);

      return name ? [name] : [];
    });
  }

  const name = string(value);

  return name ? [name] : [];
}

function query(source: LibrarySourceTrackProvenance): string {
  return [source.title, ...source.artists].join(' ');
}

export async function searchChorusEncore(
  source: LibrarySourceTrackProvenance,
): Promise<PublicDrumChartCandidate[]> {
  const response = await fetch('https://api.enchor.us/search', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      search: query(source),
      page: 1,
      instrument: 'drums',
      drumType: 'fourLanePro',
      source: 'website',
      drumsReviewed: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chorus Encore search failed: ${response.status}`);
  }

  const payload = record(await response.json());
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows.flatMap((row): PublicDrumChartCandidate[] => {
    const chart = record(row);
    const id = string(chart?.md5);
    const title = string(chart?.name);
    const artist = artists(chart?.artist);

    if (!id || !title || artist.length === 0) {
      return [];
    }

    return [
      {
        source: 'chorus-encore',
        id,
        title,
        artists: artist,
        durationSeconds: number(chart?.song_length ?? chart?.length),
        hasDrums: nonNegativeNumber(chart?.diff_drums),
        reviewed: chart?.drumsReviewed === true,
        sourceUrl: `https://enchor.us/chart/${id}`,
        downloadUrl: `https://files.enchor.us/${id}.sng`,
      },
    ];
  });
}

export async function searchRhythmVerse(
  source: LibrarySourceTrackProvenance,
): Promise<PublicDrumChartCandidate[]> {
  const response = await fetch(
    'https://rhythmverse.co/api/all/songfiles/search/live',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        data_type: 'full',
        text: query(source),
        page: '1',
        records: '25',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`RhythmVerse search failed: ${response.status}`);
  }

  const payload = record(await response.json());
  const data = record(payload?.data);
  const rows = Array.isArray(data?.songs) ? data.songs : [];

  return rows.flatMap((row): PublicDrumChartCandidate[] => {
    const entry = record(row);
    const chart = record(entry?.data);
    const file = record(entry?.file);
    const id = string(file?.file_id ?? file?.id);
    const title = string(chart?.title);
    const artist = artists(chart?.artist);
    const sourceUrl = string(
      file?.download_page_url_full ?? file?.file_url_full ?? file?.download_url,
    );

    if (!id || !title || artist.length === 0 || !sourceUrl) {
      return [];
    }

    return [
      {
        source: 'rhythmverse',
        id,
        title,
        artists: artist,
        durationSeconds: number(chart?.song_length),
        hasDrums: nonNegativeNumber(chart?.diff_drums),
        reviewed:
          approved(chart?.record_approved) &&
          nonNegativeNumber(chart?.diff_drums) &&
          chart?.pro_drums !== false,
        sourceUrl,
        ...(string(file?.file_url_full)
          ? { downloadUrl: string(file?.file_url_full) }
          : {}),
      },
    ];
  });
}

export async function resolvePublicLibraryCandidates(
  sources: readonly LibrarySourceTrackProvenance[],
  searches: readonly CatalogSearch[] = [searchChorusEncore, searchRhythmVerse],
): Promise<LibraryCandidateResolution[]> {
  const resolutions: LibraryCandidateResolution[] = [];

  for (const source of sources) {
    const candidates: PublicDrumChartCandidate[] = [];
    const failures: string[] = [];

    for (const search of searches) {
      try {
        candidates.push(...(await search(source)));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    const resolution = resolvePublicDrumCharts(source, candidates);

    if (failures.length > 0) {
      resolution.blockers.push(
        `Catalog checks incomplete: ${failures.join('; ')}`,
      );
    }

    resolutions.push(resolution);
  }

  return resolutions;
}

export async function resolveLibraryCandidates(
  event: IpcMainEvent,
  request: IpcResolveLibraryCandidatesRequest,
): Promise<void> {
  try {
    const rawSources = request?.sources;

    if (!Array.isArray(rawSources) || rawSources.length === 0) {
      throw new Error('Choose at least one source row to resolve');
    }

    const sources = rawSources.map((source) =>
      normalizeLibrarySourceProvenance(source),
    );

    if (sources.some((source) => !source)) {
      throw new Error('Source provenance is required for chart resolution');
    }

    event.reply('resolve-library-candidates', {
      results: await resolvePublicLibraryCandidates(
        sources as LibrarySourceTrackProvenance[],
      ),
    } satisfies IpcResolveLibraryCandidatesResponse);
  } catch (error) {
    event.reply('resolve-library-candidates', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
