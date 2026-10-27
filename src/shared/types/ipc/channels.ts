import type { FsChannels } from './channels-fs';
import type { AppChannels } from './channels-app';
import type { MediaChannels } from './channels-media';
import type { SubtitleChannels } from './channels-subtitles';
import type { DiagnosticsChannels } from './channels-diagnostics';
import type { PluginChannels } from './channels-plugins';
import type { LibraryChannels } from './channels-library';
import type { OnlineChannels } from './channels-online';
import type { PipChannels } from './channels-pip';
import type { ScrobblingChannels } from './channels-scrobbling';
import type { LyricsChannels } from './channels-lyrics';
import type { ToolsChannels } from './channels-tools';
import type { DiscordChannels } from './channels-discord';

// Kontrakt IPC podzielony domenami (plan 3.4). `IpcChannels` agreguje je, żeby
// `keyof IpcChannels` / `IpcChannel` pozostały jednym źródłem prawdy.
export interface IpcChannels
  extends
    FsChannels,
    AppChannels,
    MediaChannels,
    SubtitleChannels,
    DiagnosticsChannels,
    PluginChannels,
    LibraryChannels,
    OnlineChannels,
    PipChannels,
    ScrobblingChannels,
    LyricsChannels,
    ToolsChannels,
    DiscordChannels {}

export type IpcChannel = keyof IpcChannels;
