import type { Song } from '../../../types';
import type { RunSummary } from '../../services/practice-stats';

export type PerformancePostcardField =
  | 'milestone'
  | 'performance'
  | 'date'
  | 'comparison';

interface PerformancePostcardInput {
  song: Song;
  summary: RunSummary;
  previous?: RunSummary;
  fields: readonly PerformancePostcardField[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };

    return entities[character] ?? character;
  });
}

function section(summary: RunSummary): string {
  if (summary.audition) {
    return summary.audition.section_label;
  }

  const finding = summary.coachEvidence?.find(
    ({ barStart, barEnd }) => barStart !== undefined && barEnd !== undefined,
  );

  if (finding?.barStart === undefined || finding.barEnd === undefined) {
    return 'Full saved run';
  }

  return finding.barStart === finding.barEnd
    ? `Bar ${finding.barStart}`
    : `Bars ${finding.barStart}–${finding.barEnd}`;
}

function accuracy(summary: RunSummary): string {
  return `${Math.round(summary.overallAccuracy * 100)}%`;
}

function speed(summary: RunSummary): string {
  return `${(summary.playbackSpeed ?? 1).toFixed(1)}×`;
}

function sameContext(summary: RunSummary, previous: RunSummary): boolean {
  return (
    summary.mode === previous.mode &&
    summary.difficulty === previous.difficulty &&
    Math.abs((summary.playbackSpeed ?? 1) - (previous.playbackSpeed ?? 1)) <
      0.001
  );
}

function comparison(
  summary: RunSummary,
  previous: RunSummary | undefined,
): string {
  if (!previous) {
    return 'No earlier comparable saved pass yet.';
  }

  if (!sameContext(summary, previous)) {
    return 'An earlier saved pass uses a different context, so no before/after claim is made.';
  }

  return `${accuracy(previous)} → ${accuracy(summary)} accuracy at ${speed(
    summary,
  )}.`;
}

function dateLabel(completedAt: string): string {
  const date = new Date(completedAt);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : completedAt;
}

function fileName(song: Song, completedAt: string): string {
  const safeSong = song.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const safeDate = completedAt.slice(0, 10);

  return `${safeSong || 'drumroll'}-performance-${safeDate}.pdf`;
}

export function buildPerformancePostcard({
  song,
  summary,
  previous,
  fields,
}: PerformancePostcardInput): { html: string; fileName: string } {
  const selected = new Set(fields);
  const cards = [
    selected.has('milestone')
      ? `<section class="card"><p class="eyebrow">milestone</p><h2>${escapeHtml(
          song.name,
        )}</h2><p>${escapeHtml(song.artist)} · ${escapeHtml(
          section(summary),
        )}</p></section>`
      : '',
    selected.has('performance')
      ? `<section class="card"><p class="eyebrow">saved performance</p><h2>${accuracy(
          summary,
        )} at ${speed(summary)}</h2><p>${summary.totalHits} scored hits · ${
          summary.totalMisses
        } missed notes</p></section>`
      : '',
    selected.has('date')
      ? `<section class="card"><p class="eyebrow">saved on</p><h2>${escapeHtml(
          dateLabel(summary.completedAt),
        )}</h2><p>local practice evidence</p></section>`
      : '',
    selected.has('comparison')
      ? `<section class="card"><p class="eyebrow">before / after</p><h2>${escapeHtml(
          comparison(summary, previous),
        )}</h2><p>Only comparable saved evidence is treated as a change.</p></section>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return {
    fileName: fileName(song, summary.completedAt),
    html: `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:148mm 105mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#f6f0e6;color:#201713;font-family:Arial,sans-serif}.postcard{width:148mm;min-height:105mm;padding:12mm;background:radial-gradient(circle at top right,#f6cc7f 0,transparent 34%),linear-gradient(135deg,#251913 0,#36231a 46%,#7e4029 100%);color:#fef7ee}.eyebrow{margin:0;color:#f8c979;font-size:9pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.postcard>header{max-width:95mm}.postcard h1{margin:4mm 0 2mm;font-family:Georgia,serif;font-size:29pt;line-height:1.02}.postcard>header p:last-child{margin:0;color:#f7e6d2;font-size:10pt;line-height:1.45}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;margin-top:8mm}.card{min-height:25mm;padding:4.5mm;border:1px solid rgba(255,247,238,.35);border-radius:4mm;background:rgba(255,249,239,.12)}.card h2{margin:2mm 0 1mm;font-family:Georgia,serif;font-size:15pt;line-height:1.1}.card p:last-child{margin:0;color:#f7e6d2;font-size:9pt;line-height:1.4}.footer{margin-top:6mm;color:#f7e6d2;font-size:8.5pt}</style></head><body><main class="postcard"><header><p class="eyebrow">Drumroll · private performance postcard</p><h1>Saved proof, ready to keep.</h1><p>This file stays local until you choose to share it. Drumroll posts nothing for you.</p></header><div class="grid">${cards}</div><p class="footer">Only the fields selected at export are included.</p></main></body></html>`,
  };
}
