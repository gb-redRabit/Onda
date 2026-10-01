import type { SystemChannels } from './channels-system';
import type { LibraryChannels } from './channels-library';
import type { OnlineChannels } from './channels-online';
import type { PipChannels } from './channels-pip';

// Kontrakt IPC podzielony domenami (plan 3.4). `IpcChannels` agreguje je, żeby
// `keyof IpcChannels` / `IpcChannel` pozostały jednym źródłem prawdy.
export interface IpcChannels extends SystemChannels, LibraryChannels, OnlineChannels, PipChannels {}

export type IpcChannel = keyof IpcChannels;
