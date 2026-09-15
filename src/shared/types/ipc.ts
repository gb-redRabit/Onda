// Barrel for the IPC type contract. The definitions live in `src/shared/types/ipc/`
// split by domain (plan 3.4); this module re-exports the public surface so existing
// `@shared/types/ipc` imports keep working unchanged.

export type { MusicbrainzRelease } from './ipc/musicbrainz';
export type {
  IpcYoutubeVideo,
  IpcSubscription,
  IpcSubscriptionDownloadPrefs,
  IpcSubscriptionPatch,
  IpcSubscriptionCheckResult,
  IpcSavedStream,
  IpcSavedPlaylist,
  IpcSavedData,
  IpcRadioStation
} from './ipc/youtube';
export type {
  IpcCoverSpec,
  IpcMetaOverride,
  IpcDownloadConfig,
  IpcDownloadProfile,
  IpcDownloadJobInput,
  IpcDownloadErrorCode,
  IpcStreamErrorCode,
  IpcStreamResult,
  IpcDownloadTask,
  IpcNewVideosEvent
} from './ipc/download';
export type {
  PluginPermissions,
  PluginSettingField,
  PluginLayoutElement,
  PluginManifest,
  PluginInfo,
  IpcPluginGetResult,
  IpcPluginUninstallResult,
  IpcPluginInstallResult,
  PluginFetchOptions,
  PluginFetchResult
} from './ipc/plugins';
export type { YoutubeAuthStatus, AppInfo, UpdaterState } from './ipc/app';
export type {
  DepSource,
  DepToolStatus,
  DepToolPaths,
  IpcWarningEntry
} from './ipc/channels-system';
export type { IpcChannels, IpcChannel } from './ipc/channels';
