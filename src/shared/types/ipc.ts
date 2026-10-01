// Barrel dla kontraktu typów IPC. Definicje żyją w `src/shared/types/ipc/`
// podzielone domenami (plan 3.4); ten moduł re-eksportuje publiczną powierzchnię, żeby istniejące
// importy `@shared/types/ipc` działały bez zmian.

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
  PluginExample,
  IpcPluginGetResult,
  IpcPluginUninstallResult,
  IpcPluginInstallResult,
  PluginFetchOptions,
  PluginFetchResult
} from './ipc/plugins';
export type {
  YoutubeAuthStatus,
  AppInfo,
  UpdaterState,
  UpdaterEventName,
  IpcUpdaterEvent
} from './ipc/app';
export type {
  DepSource,
  DepToolStatus,
  DepToolPaths,
  IpcWarningEntry,
  AppCacheClearResult,
  AppFactoryResetResult,
  IpcPerfPhase,
  IpcPerfProcess,
  IpcPerfSnapshot
} from './ipc/channels-system';
export type { IpcChannels, IpcChannel } from './ipc/channels';
