import type { IpcChannel, IpcChannels } from '@shared/types/ipc';
import { logger } from './logger';

export function ipcInvoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcChannels[C]['args']
): Promise<IpcChannels[C]['result'] | null> {
  if (!window.api) {
    logger.warn('IPC', `window.api not available for: ${channel}`);
    return Promise.resolve(null);
  }
  return window.api.invoke(channel, ...args).catch((err: unknown) => {
    logger.error('IPC', `Failed "${channel}"`, err);
    return null;
  }) as Promise<IpcChannels[C]['result'] | null>;
}

export function ipcSend(channel: string, ...args: unknown[]): void {
  if (!window.api) {
    logger.warn('IPC', `window.api not available for: ${channel}`);
    return;
  }
  window.api.send(channel, ...args);
}
