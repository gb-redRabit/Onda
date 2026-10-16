// Wspólna infrastruktura rejestracji globalnych nasłuchów IPC (plan 2.8).
// Każda domena dostaje własny „scope”, który zbiera zwroty odsubskrybowania
// i pozwala je wszystkie zwolnić jednym wywołaniem `dispose`.
import type { IpcReceiveChannel } from '@shared/ipc/contract';

export type Listen = (channel: IpcReceiveChannel, callback: (...args: unknown[]) => void) => void;

export interface ListenerScope {
  listen: Listen;
  dispose: () => void;
}

export function createListenerScope(): ListenerScope {
  const cleanups: Array<(() => void) | undefined> = [];
  const listen: Listen = (channel, callback) => {
    cleanups.push(window.api?.on(channel, callback));
  };
  const dispose = (): void => {
    for (const off of cleanups) off?.();
  };
  return { listen, dispose };
}
