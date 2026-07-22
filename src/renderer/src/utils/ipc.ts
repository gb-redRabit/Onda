import type { IpcChannels, IpcChannel } from '@shared/types/ipc';
import { logger } from '@renderer/utils/logger';

export function safeInvoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcChannels[C]['args']
): Promise<IpcChannels[C]['result'] | null> {
  if (!window.api) return Promise.resolve(null);
  return window.api.invoke(channel, ...args).catch((err) => {
    logger.error('IPC', `${channel} failed`, err);
    return null;
  }) as Promise<IpcChannels[C]['result'] | null>;
}
