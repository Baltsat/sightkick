import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { CoachFindings } from '../../services/coach';
import { AICoach } from './AICoach';
import { CoachSettings } from './CoachSettings';

vi.mock('./MiniNotation', () => ({
  MiniNotation: () => <div data-testid="coach-notation" />,
}));

const result: CoachFindings = {
  analyzedRuns: 3,
  findings: [
    {
      id: 'trouble-4-5',
      kind: 'trouble-bars',
      severity: 'high',
      title: 'Bars 4–5 need a loop',
      summary: '52% across 20 scored notes.',
      skillTag: 'fills',
      evidence: {
        barStart: 4,
        barEnd: 5,
        accuracy: 0.52,
        sampleCount: 20,
      },
    },
  ],
};
let ipc: IpcMock;

beforeEach(() => {
  ipc = installIpcMock();
});

describe('AICoach', () => {
  it('renders evidence and launches targeted practice or its mapped lesson', () => {
    const onPracticeBars = vi.fn();
    const onTrainSkill = vi.fn();

    render(
      <AntdApp>
        <AICoach
          result={result}
          song={{ name: 'Song', artist: 'Artist', difficulty: 'expert' }}
          measures={[]}
          records={[]}
          onPracticeBars={onPracticeBars}
          onTrainSkill={onTrainSkill}
        />
      </AntdApp>,
    );

    expect(
      screen.getByText('3 full-resolution runs analyzed.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('coach-notation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('coach-practice-bars'));
    fireEvent.click(screen.getByTestId('coach-train-skill'));

    expect(onPracticeBars).toHaveBeenCalledWith(4, 5, 0.7);
    expect(onTrainSkill).toHaveBeenCalledWith('18.03');
  });

  it('requests and renders optional Claude notes', async () => {
    render(
      <AntdApp>
        <AICoach
          result={result}
          song={{ name: 'Song', artist: 'Artist', difficulty: 'expert' }}
          measures={[]}
          records={[]}
          onPracticeBars={vi.fn()}
          onTrainSkill={vi.fn()}
        />
      </AntdApp>,
    );

    fireEvent.click(screen.getByText('Get coaching notes'));

    expect(ipc.sent).toContainEqual({
      channel: 'get-coaching-notes',
      args: [
        expect.objectContaining({
          song: expect.objectContaining({ name: 'Song' }),
        }),
      ],
    });

    act(() => {
      ipc.emit('coaching-notes', { notes: 'Loop bars 4–5 at 0.7x.' });
    });

    expect(await screen.findByTestId('coaching-notes')).toHaveTextContent(
      'Loop bars 4–5 at 0.7x.',
    );
  });
});

describe('CoachSettings', () => {
  it('defaults to Codex with no credential fields shown', () => {
    render(
      <AntdApp>
        <CoachSettings />
      </AntdApp>,
    );

    act(() => {
      ipc.emit('coach-settings', {
        provider: 'codex',
        apiKeyConfigured: false,
        huggingFaceTokenConfigured: false,
        huggingFaceModel: 'meta-llama/Llama-3.3-70B-Instruct',
      });
    });

    expect(screen.getByTestId('coach-codex-hint')).toBeInTheDocument();
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull();
    expect(screen.queryByLabelText('Hugging Face token')).toBeNull();
  });

  it('switching to Anthropic uses a masked API-key input and exposes only configured state', () => {
    render(
      <AntdApp>
        <CoachSettings />
      </AntdApp>,
    );

    act(() => {
      ipc.emit('coach-settings', {
        provider: 'codex',
        apiKeyConfigured: false,
        huggingFaceTokenConfigured: false,
        huggingFaceModel: 'meta-llama/Llama-3.3-70B-Instruct',
      });
    });

    fireEvent.click(screen.getByText('Anthropic'));

    expect(ipc.sent).toContainEqual({
      channel: 'save-coach-settings',
      args: [{ provider: 'anthropic' }],
    });

    const input = screen.getByLabelText('Anthropic API key');

    expect(input).toHaveAttribute('type', 'password');
    act(() => {
      ipc.emit('coach-settings-saved', {
        ok: true,
        provider: 'anthropic',
        apiKeyConfigured: true,
        huggingFaceTokenConfigured: false,
        huggingFaceModel: 'meta-llama/Llama-3.3-70B-Instruct',
      });
    });
    expect(input).toHaveAttribute('placeholder', 'API key saved');
  });

  it('switching to Hugging Face shows a masked token field and a visible model field', () => {
    render(
      <AntdApp>
        <CoachSettings />
      </AntdApp>,
    );

    act(() => {
      ipc.emit('coach-settings', {
        provider: 'codex',
        apiKeyConfigured: false,
        huggingFaceTokenConfigured: false,
        huggingFaceModel: 'meta-llama/Llama-3.3-70B-Instruct',
      });
    });

    fireEvent.click(screen.getByText('Hugging Face'));

    const token = screen.getByLabelText('Hugging Face token');
    const model = screen.getByLabelText('Hugging Face model');

    expect(token).toHaveAttribute('type', 'password');
    expect(model).toHaveValue('meta-llama/Llama-3.3-70B-Instruct');

    fireEvent.change(token, { target: { value: 'hf_secret' } });
    fireEvent.click(screen.getByText('Save token'));

    expect(ipc.sent).toContainEqual({
      channel: 'save-coach-settings',
      args: [{ huggingFaceToken: 'hf_secret' }],
    });
    expect(JSON.stringify(ipc.sent)).toContain('hf_secret');

    act(() => {
      ipc.emit('coach-settings-saved', {
        ok: true,
        provider: 'huggingface',
        apiKeyConfigured: false,
        huggingFaceTokenConfigured: true,
        huggingFaceModel: 'meta-llama/Llama-3.3-70B-Instruct',
      });
    });

    expect(screen.getByLabelText('Hugging Face token')).toHaveAttribute(
      'placeholder',
      'Token saved',
    );
  });
});
