import { Button, Checkbox, Modal } from 'antd';
import { useState } from 'react';
import type { Song } from '../../../types';
import type { RunSummary } from '../../services/practice-stats';
import { MODAL_ABOVE_POPOVER_Z_INDEX, modalStyles } from '../../overlayStyles';
import type { PerformancePostcardField } from './performancePostcard';

interface PerformancePostcardProps {
  open: boolean;
  onClose: () => void;
  onExport: (fields: PerformancePostcardField[]) => void;
  exporting: boolean;
  song: Song;
  summary: RunSummary;
  previous?: RunSummary;
}

const fields: Array<{
  id: PerformancePostcardField;
  label: string;
  hint: string;
}> = [
  {
    id: 'milestone',
    label: 'Song and section',
    hint: 'The saved song title and the exact section when one exists.',
  },
  {
    id: 'performance',
    label: 'Speed and accuracy',
    hint: 'This saved run’s speed, score, hits, and misses.',
  },
  {
    id: 'date',
    label: 'Saved date',
    hint: 'The date attached to this local practice evidence.',
  },
  {
    id: 'comparison',
    label: 'Before / after',
    hint: 'Only a comparable earlier saved pass can support a change claim.',
  },
];

export function PerformancePostcard({
  open,
  onClose,
  onExport,
  exporting,
  song,
  summary,
  previous,
}: PerformancePostcardProps) {
  const [selected, setSelected] = useState<PerformancePostcardField[]>([]);
  const toggle = (field: PerformancePostcardField) => {
    setSelected((current) =>
      current.includes(field)
        ? current.filter((candidate) => candidate !== field)
        : [...current, field],
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Private performance postcard"
      zIndex={MODAL_ABOVE_POPOVER_Z_INDEX + 1}
      styles={modalStyles}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="export"
          data-testid="performance-postcard-export"
          type="primary"
          disabled={selected.length === 0}
          loading={exporting}
          onClick={() => onExport(selected)}
        >
          Export private PDF
        </Button>,
      ]}
      wrapProps={{ 'data-testid': 'performance-postcard-dialog' }}
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm leading-6 text-text-muted">
          Choose the saved details to include. This creates a local PDF and
          never posts it anywhere.
        </p>
        <p className="m-0 text-xs text-text-faint">
          {song.name} · {Math.round(summary.overallAccuracy * 100)}%
          {previous ? ' · one earlier saved run is available' : ''}
        </p>
        <div
          className="flex flex-col gap-2"
          data-testid="performance-postcard-fields"
        >
          {fields.map((field) => (
            <Checkbox
              key={field.id}
              checked={selected.includes(field.id)}
              data-testid={`performance-postcard-${field.id}`}
              onChange={() => toggle(field.id)}
            >
              <span className="font-medium text-text">{field.label}</span>
              <span className="block text-xs leading-5 text-text-muted">
                {field.hint}
              </span>
            </Checkbox>
          ))}
        </div>
      </div>
    </Modal>
  );
}
