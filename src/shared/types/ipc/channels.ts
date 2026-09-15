import type { SystemChannels } from './channels-system';
import type { LibraryChannels } from './channels-library';
import type { OnlineChannels } from './channels-online';
import type { PipChannels } from './channels-pip';

// IPC contract split by domain (plan 3.4). `IpcChannels` aggregates them so
// `keyof IpcChannels` / `IpcChannel` stay a single source of truth.
export interface IpcChannels extends SystemChannels, LibraryChannels, OnlineChannels, PipChannels {}

export type IpcChannel = keyof IpcChannels;
