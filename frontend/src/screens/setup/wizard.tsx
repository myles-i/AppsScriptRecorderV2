import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { StepCreate } from './step-create';
import { StepDeploy } from './step-deploy';
import { StepConnect } from './step-connect';
import { StepAuthorize } from './step-authorize';
import { StepApiKey } from './step-apikey';
import { getApiClient, resetApiClient } from '../../api/index';
import type { AppScreen } from '../../state/app-state';

type WizardStep = 'create' | 'deploy' | 'connect' | 'authorize' | 'apikey';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
  onNavigate: (screen: AppScreen) => void;
}

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('create');
  const [authData, setAuthData] = useState<{
    token: string;
    fileId: string;
    fileName: string;
    folderUrl: string;
  } | null>(null);

  const handleAuthorized = async () => {
    // Check if API key is already configured
    try {
      const api = getApiClient();
      const status = await api.getApiKeyStatus();
      if (status.configured) {
        onComplete();
        return;
      }
    } catch {
      // Continue to API key step
    }
    setStep('apikey');
  };

  const STEPS: WizardStep[] = ['create', 'deploy', 'connect', 'authorize', 'apikey'];
  const stepIndex = STEPS.indexOf(step);
  const displayIndex = Math.min(stepIndex, 3); // authorize = step 3b, counts as 3

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #e8eaed' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ flex: 1, margin: 0, fontSize: 20, color: '#202124' }}>Set up Drive sync</h1>
          <button
            onClick={onSkip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', fontSize: 14 }}
          >
            Skip
          </button>
        </div>

        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: 4, paddingBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= displayIndex ? '#1a73e8' : '#e8eaed',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {step === 'create' && (
          <StepCreate onNext={() => setStep('deploy')} />
        )}

        {step === 'deploy' && (
          <StepDeploy
            onNext={() => setStep('connect')}
            onBack={() => setStep('create')}
          />
        )}

        {step === 'connect' && (
          <StepConnect
            onAuthorize={(token, fileId, fileName, folderUrl) => {
              setAuthData({ token, fileId, fileName, folderUrl });
              setStep('authorize');
            }}
            onBack={() => setStep('deploy')}
          />
        )}

        {step === 'authorize' && authData && (
          <StepAuthorize
            token={authData.token}
            fileId={authData.fileId}
            fileName={authData.fileName}
            folderUrl={authData.folderUrl}
            onSuccess={handleAuthorized}
            onCancel={() => setStep('connect')}
          />
        )}

        {step === 'apikey' && (
          <StepApiKey
            api={getApiClient()}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
}
