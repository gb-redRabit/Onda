import type { OndaAPI } from '../shared/ipc/api';

export type { OndaAPI } from '../shared/ipc/api';
export type { IpcInvokeChannel, IpcSendChannel, IpcReceiveChannel } from '../shared/ipc/contract';

declare global {
  interface Window {
    api: OndaAPI;
  }
}
