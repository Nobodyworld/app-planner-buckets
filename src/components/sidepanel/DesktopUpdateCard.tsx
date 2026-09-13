import { useState } from 'react';
import {
  checkDesktopUpdate,
  desktopUpdaterAvailable,
  installDesktopUpdate,
  type DesktopUpdateMetadata,
} from '../../services/desktopUpdater';

export interface DesktopUpdateCardProps {
  runtimeAvailable?: boolean;
  checkForUpdate?: () => Promise<DesktopUpdateMetadata>;
  installUpdate?: () => Promise<void>;
}

type UpdatePhase = 'idle' | 'checking' | 'ready' | 'current' | 'installing' | 'unconfigured' | 'error';

export function DesktopUpdateCard({
  runtimeAvailable = desktopUpdaterAvailable(),
  checkForUpdate = checkDesktopUpdate,
  installUpdate = installDesktopUpdate,
}: DesktopUpdateCardProps) {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [metadata, setMetadata] = useState<DesktopUpdateMetadata | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!runtimeAvailable) return null;

  const handleCheck = async (): Promise<void> => {
    setPhase('checking');
    setMessage(null);
    try {
      const next = await checkForUpdate();
      setMetadata(next);
      if (!next.configured) {
        setPhase('unconfigured');
        setMessage(next.message ?? 'Signed updates are not configured in this build.');
      } else if (next.available) {
        setPhase('ready');
      } else {
        setPhase('current');
      }
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleInstall = async (): Promise<void> => {
    setPhase('installing');
    setMessage('Saving planner data and creating a pre-update recovery snapshot…');
    const root = document.getElementById('root');
    root?.setAttribute('aria-busy', 'true');
    root?.setAttribute('inert', '');
    try {
      await installUpdate();
      setMessage('The signed update installer has started. Planner Buckets will restart or close as required by Windows.');
    } catch (error) {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-busy');
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="desktop-update-card" aria-label="Desktop updates">
      <div className="desktop-update-head">
        <strong>Desktop updates</strong>
        {metadata?.currentVersion ? <span>v{metadata.currentVersion}</span> : null}
      </div>
      {phase === 'ready' && metadata?.version ? (
        <p className="desktop-update-message" role="status">
          Version <strong>{metadata.version}</strong> is available.
          {metadata.notes ? ` ${metadata.notes}` : ''}
        </p>
      ) : null}
      {phase === 'current' ? (
        <p className="desktop-update-message" role="status">Planner Buckets is up to date.</p>
      ) : null}
      {(phase === 'unconfigured' || phase === 'error' || phase === 'installing') && message ? (
        <p className="desktop-update-message" role={phase === 'error' ? 'alert' : 'status'}>{message}</p>
      ) : null}
      <div className="desktop-update-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={phase === 'checking' || phase === 'installing'}
          onClick={() => { void handleCheck(); }}
        >
          {phase === 'checking' ? 'Checking…' : 'Check for updates'}
        </button>
        {phase === 'ready' ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => { void handleInstall(); }}
          >
            Install and restart
          </button>
        ) : null}
      </div>
      {phase === 'ready' ? (
        <p className="desktop-update-helper">
          Installation begins only after pending planner changes are saved and a verified local recovery snapshot is created.
        </p>
      ) : null}
    </section>
  );
}
