import { logger } from '@renderer/utils/logger'

export function safeInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  if (!window.api) return Promise.resolve(null);
  return window.api.invoke(channel, ...args).catch((err) => {
    logger.error('IPC', `${channel} failed`, err);
    return null;
  }) as Promise<T | null>;
}
