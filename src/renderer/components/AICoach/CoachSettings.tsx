import { Button, Divider, Input, Segmented } from 'antd';
import { useEffect, useState } from 'react';
import {
  CoachProvider,
  DEFAULT_COACH_PROVIDER,
  DEFAULT_HUGGING_FACE_MODEL,
  IpcCoachSettings,
  IpcCoachSettingsSaved,
  IpcSaveCoachSettingsRequest,
} from '../../../types';

const PROVIDER_OPTIONS: { label: string; value: CoachProvider }[] = [
  { label: 'Codex (local)', value: 'codex' },
  { label: 'Hugging Face', value: 'huggingface' },
  { label: 'Anthropic', value: 'anthropic' },
];

export function CoachSettings() {
  const [provider, setProvider] = useState<CoachProvider>(
    DEFAULT_COACH_PROVIDER,
  );
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [hfToken, setHfToken] = useState('');
  const [hfTokenConfigured, setHfTokenConfigured] = useState(false);
  const [savingHfToken, setSavingHfToken] = useState(false);
  const [hfModel, setHfModel] = useState(DEFAULT_HUGGING_FACE_MODEL);
  const [savingHfModel, setSavingHfModel] = useState(false);

  useEffect(() => {
    const off = window.electron.ipcRenderer.once<IpcCoachSettings>(
      'coach-settings',
      (settings) => {
        setProvider(settings.provider);
        setApiKeyConfigured(settings.apiKeyConfigured);
        setHfTokenConfigured(settings.huggingFaceTokenConfigured);
        setHfModel(settings.huggingFaceModel);
      },
    );

    window.electron.ipcRenderer.sendMessage('get-coach-settings');

    return off;
  }, []);

  const save = (request: IpcSaveCoachSettingsRequest, onDone: () => void) => {
    window.electron.ipcRenderer.once<IpcCoachSettingsSaved>(
      'coach-settings-saved',
      (result) => {
        setProvider(result.provider);
        setApiKeyConfigured(result.apiKeyConfigured);
        setHfTokenConfigured(result.huggingFaceTokenConfigured);
        setHfModel(result.huggingFaceModel);
        onDone();
      },
    );
    window.electron.ipcRenderer.sendMessage('save-coach-settings', request);
  };
  const changeProvider = (value: CoachProvider) => {
    setProvider(value);
    save({ provider: value }, () => {});
  };
  const saveApiKey = (value: string) => {
    setSavingApiKey(true);
    save({ apiKey: value }, () => {
      setApiKey('');
      setSavingApiKey(false);
    });
  };
  const saveHfToken = (value: string) => {
    setSavingHfToken(true);
    save({ huggingFaceToken: value }, () => {
      setHfToken('');
      setSavingHfToken(false);
    });
  };
  const saveHfModel = (value: string) => {
    setSavingHfModel(true);
    save({ huggingFaceModel: value || DEFAULT_HUGGING_FACE_MODEL }, () => {
      setSavingHfModel(false);
    });
  };

  return (
    <>
      <Divider className="my-1" />
      <div className="flex flex-col gap-3" data-testid="coach-settings">
        <div>
          <div className="text-sm font-semibold text-text">
            AI coaching notes
          </div>
          <div className="text-xs text-text-muted">
            Drumroll sends findings and song metadata, never audio.
          </div>
        </div>
        <Segmented
          data-testid="coach-provider-select"
          options={PROVIDER_OPTIONS}
          value={provider}
          onChange={(value) => changeProvider(value as CoachProvider)}
        />
        {provider === 'codex' && (
          <div
            className="text-xs text-text-muted"
            data-testid="coach-codex-hint"
          >
            Runs the Codex CLI already installed on this machine — no key
            needed. If notes fail, install Codex and run{' '}
            <code>codex login</code>.
          </div>
        )}
        {provider === 'huggingface' && (
          <div className="flex flex-col gap-2">
            <Input.Password
              aria-label="Hugging Face token"
              autoComplete="off"
              placeholder={hfTokenConfigured ? 'Token saved' : 'hf_…'}
              value={hfToken}
              onChange={(event) => setHfToken(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="primary"
                size="small"
                loading={savingHfToken}
                disabled={hfToken.trim() === ''}
                onClick={() => saveHfToken(hfToken.trim())}
              >
                Save token
              </Button>
              {hfTokenConfigured && (
                <Button
                  size="small"
                  disabled={savingHfToken}
                  onClick={() => saveHfToken('')}
                >
                  Remove token
                </Button>
              )}
            </div>
            <Input
              aria-label="Hugging Face model"
              value={hfModel}
              onChange={(event) => setHfModel(event.target.value)}
            />
            <Button
              size="small"
              loading={savingHfModel}
              disabled={hfModel.trim() === ''}
              onClick={() => saveHfModel(hfModel.trim())}
            >
              Save model
            </Button>
          </div>
        )}
        {provider === 'anthropic' && (
          <div className="flex flex-col gap-2">
            <Input.Password
              aria-label="Anthropic API key"
              autoComplete="off"
              placeholder={apiKeyConfigured ? 'API key saved' : 'sk-ant-…'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="primary"
                size="small"
                loading={savingApiKey}
                disabled={apiKey.trim() === ''}
                onClick={() => saveApiKey(apiKey.trim())}
              >
                Save key
              </Button>
              {apiKeyConfigured && (
                <Button
                  size="small"
                  disabled={savingApiKey}
                  onClick={() => saveApiKey('')}
                >
                  Remove key
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
