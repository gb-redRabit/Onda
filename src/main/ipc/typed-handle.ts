import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import type { IpcArgs, IpcInvokeChannel, IpcResult } from '../../shared/ipc/contract';

/**
 * Rejestruje handler `invoke` powiązany z kontraktem IPC: kanał musi istnieć
 * w `src/shared/types/ipc`, a argumenty i wynik muszą zgadzać się z deklaracją.
 * Ładunek nadal pochodzi z renderera, więc handler waliduje wartości w czasie
 * działania — typy opisują zamierzone użycie, nie gwarantują poprawności danych.
 */
export function handleIpc<C extends IpcInvokeChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, ...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
): void {
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as IpcArgs<C>)));
}
