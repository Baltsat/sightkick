import { fireEvent, render, screen, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../../../types';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import { PerformancePostcard } from './PerformancePostcardDialog';

const song = { name: 'Daybreak Anthem', artist: 'Drumroll Sessions' } as Song;

describe('PerformancePostcard', () => {
  it('requires an explicit field selection before manual export', () => {
    const onExport = vi.fn();

    render(
      <AntdApp>
        <PerformancePostcard
          open
          onClose={vi.fn()}
          onExport={onExport}
          exporting={false}
          song={song}
          summary={multiLaneRunFixture()}
        />
      </AntdApp>,
    );

    const dialog = within(screen.getByTestId('performance-postcard-dialog'));
    const exportButton = dialog.getByTestId('performance-postcard-export');

    expect(exportButton).toBeDisabled();
    fireEvent.click(dialog.getByTestId('performance-postcard-milestone'));
    fireEvent.click(dialog.getByTestId('performance-postcard-performance'));
    fireEvent.click(exportButton);

    expect(onExport).toHaveBeenCalledWith(['milestone', 'performance']);
  });
});
