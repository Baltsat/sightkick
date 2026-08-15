import { KIT_ELEMENTS } from '../../constants';
import { WrongHitCount } from '../../services/practice-stats';

interface Props {
  wrongHitCounts: WrongHitCount[];
}

export function WrongHitTable({ wrongHitCounts }: Props) {
  if (wrongHitCounts.length === 0) {
    return (
      <div
        className="text-base text-text-muted"
        data-testid="wrong-hit-table-empty"
      >
        No wrong hits this run.
      </div>
    );
  }

  const rows = [...wrongHitCounts].sort((a, b) => b.count - a.count);

  return (
    <table className="w-full text-base" data-testid="wrong-hit-table">
      <thead>
        <tr className="text-left text-text-muted">
          <th className="pb-2 font-normal">Pad</th>
          <th className="pb-2 text-right font-normal">Wrong hits</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.element} data-testid={`wrong-hit-row-${row.element}`}>
            <td className="text-text-body">
              {KIT_ELEMENTS.get(row.element)?.displayName ?? row.element}
            </td>
            <td className="text-right tabular-nums text-text-body">
              {row.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
