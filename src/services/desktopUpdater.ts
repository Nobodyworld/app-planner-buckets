import { invoke, isTauri } from '@tauri-apps/api/core';
import { prepareDesktopUpdaterInstallContext } from '../storage/plannerStorageBridge';

export interface DesktopUpdateMetadata {
  configured: boolean;
  available: boolean;
  currentVersion: string;
  version?: string;
  notes?: string | null;
  message?: string;
}

export type UpdaterInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const parseMetadata = (serialized: string): DesktopUpdateMetadata => {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Desktop updater returned an unsupported response.');
  }
  const item = value as Partial<DesktopUpdateMetadata>;
  if (
    typeof item.configured !== 'boolean'
    || typeof item.available !== 'boolean'
    || typeof item.currentVersion !== 'string'
  ) {
    throw new Error('Desktop updater returned incomplete status information.');
  }
  if (item.available && typeof item.version !== 'string') {
    throw new Error('Desktop updater did not identify the available version.');
  }
  return item as DesktopUpdateMetadata;
};

export const desktopUpdaterAvailable = (): boolean => isTauri();

export const checkDesktopUpdate = async (
  invokeCommand: UpdaterInvoke = invoke,
): Promise<DesktopUpdateMetadata> => (
  parseMetadata(await invokeCommand<string>('desktop_update_check'))
);

export const installDesktopUpdate = async (
  invokeCommand: UpdaterInvoke = invoke,
  prepareInstall = prepareDesktopUpdaterInstallContext,
  createTimestamp: () => string = () => new Date().toISOString(),
): Promise<void> => {
  const context = await prepareInstall();
  await invokeCommand('desktop_update_install', {
    serialized: context.serialized,
    session: context.session,
    timestamp: createTimestamp(),
  });
};
