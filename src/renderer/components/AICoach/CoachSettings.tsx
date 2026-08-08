import { Button, Divider, Input } from 'antd';
import { useEffect, useState } from 'react';
import { IpcCoachSettings, IpcCoachSettingsSaved } from '../../../types';

export function CoachSettings() {
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const off = window.electron.ipcRenderer.once<IpcCoachSettings>(
      'coach-settings',
      (settings) => setConfigured(settings.apiKeyConfigured),
    );

    window.electron.ipcRenderer.sendMessage('get-coach-settings');

    return off;
  }, []);

  const save = (value: string) => {
    setSaving(true);
    window.electron.ipcRenderer.once<IpcCoachSettingsSaved>(
      'coach-settings-saved',
      (result) => {
        setConfigured(result.apiKeyConfigured);
        setApiKey('');
        setSaving(false);
      },
    );
    window.electron.ipcRenderer.sendMessage('save-coach-settings', {
      apiKey: value,
    });
  };

  return (
    <>
      <Divider className="my-1" />
      <div className="flex flex-col gap-2" data-testid="coach-settings">
        <div>
          <div className="text-sm font-semibold text-text">
            AI coaching notes
          </div>
          <div className="text-xs text-text-muted">
            Optional Anthropic key. Drumroll sends findings and song metadata,
            never audio.
          </div>
        </div>
        <Input.Password
          aria-label="Anthropic API key"
          autoComplete="off"
          placeholder={configured ? 'API key saved' : 'sk-ant-…'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <div className="flex gap-2">
          <Button
            type="primary"
            size="small"
            loading={saving}
            disabled={apiKey.trim() === ''}
            onClick={() => save(apiKey.trim())}
          >
            Save key
          </Button>
          {configured && (
            <Button size="small" disabled={saving} onClick={() => save('')}>
              Remove key
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
