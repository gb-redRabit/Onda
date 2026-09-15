import type { BoundIpcMethod, IpcArgs, IpcChannel, IpcResult } from './contract';

// Shared declaration of the renderer-facing API (plan 1.4): the preload
// implements it, the renderer consumes it through `Window['api']`. Wrapper
// signatures derive from the contract, so they cannot drift from the channels.
export interface OndaAPI {
  mediaServerUrl: string;
  getWindowId: () => Promise<IpcResult<'window:id'>>;
  invoke: <C extends IpcChannel>(channel: C, ...args: IpcArgs<C>) => Promise<IpcResult<C>>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
  getFilePath: (file: File) => string;

  // video PiP
  pipStart: BoundIpcMethod<'pip:start'>;
  pipStop: BoundIpcMethod<'pip:stop'>;
  pipPreviewStart: BoundIpcMethod<'pip:previewStart'>;
  pipPreviewStop: BoundIpcMethod<'pip:previewStop'>;
  pipPreviewUpdate: BoundIpcMethod<'pip:previewUpdate'>;
  pipPreload: BoundIpcMethod<'pip:preload'>;
  pipLoadTrack: BoundIpcMethod<'pip:loadtrack'>;
  pipUpdateSubtitle: BoundIpcMethod<'pip:updateSubtitle'>;

  // dependencies / diagnostics / updater
  checkFfmpeg: BoundIpcMethod<'dep:checkFfmpeg'>;
  checkFfprobe: BoundIpcMethod<'dep:checkFfprobe'>;
  checkYtdlp: BoundIpcMethod<'dep:checkYtdlp'>;
  checkMkvextract: BoundIpcMethod<'dep:checkMkvextract'>;
  installFfmpeg: BoundIpcMethod<'dep:installFfmpeg'>;
  installYtdlp: BoundIpcMethod<'dep:installYtdlp'>;
  installMkvextract: BoundIpcMethod<'dep:installMkvextract'>;
  getDependencyPaths: BoundIpcMethod<'dep:getPaths'>;
  checkUpdateYtdlp: BoundIpcMethod<'dep:checkUpdateYtdlp'>;
  updateYtdlp: BoundIpcMethod<'dep:updateYtdlp'>;
  removeYtdlp: BoundIpcMethod<'dep:removeYtdlp'>;
  removeFfmpeg: BoundIpcMethod<'dep:removeFfmpeg'>;
  removeFfprobe: BoundIpcMethod<'dep:removeFfprobe'>;
  removeMkvextract: BoundIpcMethod<'dep:removeMkvextract'>;
  cancelDepInstall: BoundIpcMethod<'dep:cancelInstall'>;
  readLogs: BoundIpcMethod<'diagnostics:readLogs'>;
  clearLogs: BoundIpcMethod<'diagnostics:clearLogs'>;
  getRecentWarnings: BoundIpcMethod<'diagnostics:getWarnings'>;
  downloadLog: BoundIpcMethod<'diagnostics:downloadLog'>;
  getUpdaterState: BoundIpcMethod<'updater:getState'>;
  checkForUpdates: BoundIpcMethod<'updater:check'>;
  downloadUpdate: BoundIpcMethod<'updater:download'>;
  installUpdate: BoundIpcMethod<'updater:install'>;

  // media / tags / covers / subtitles
  getCover: BoundIpcMethod<'media:getCover'>;
  getDuration: BoundIpcMethod<'media:getDuration'>;
  getDurations: BoundIpcMethod<'media:batchDurations'>;
  writeTags: BoundIpcMethod<'media:writeTags'>;
  renameFile: BoundIpcMethod<'media:renameFile'>;
  writeCover: BoundIpcMethod<'media:writeCover'>;
  readCover: BoundIpcMethod<'media:readCover'>;
  grantMediaAccess: BoundIpcMethod<'media:grantAccess'>;
  checkAudioCodec: BoundIpcMethod<'media:checkAudioCodec'>;
  transcodeAudio: BoundIpcMethod<'media:transcodeAudio'>;
  transcodeAudioChunk: BoundIpcMethod<'media:transcodeAudioChunk'>;
  transcodeVideo: BoundIpcMethod<'media:transcodeVideo'>;
  openImageDialog: BoundIpcMethod<'dialog:openImage'>;
  openSubtitleDialog: BoundIpcMethod<'dialog:openSubtitle'>;
  musicbrainzSearchRelease: BoundIpcMethod<'musicbrainz:searchRelease'>;
  musicbrainzLookupRelease: BoundIpcMethod<'musicbrainz:lookupRelease'>;
  musicbrainzGetCoverData: BoundIpcMethod<'musicbrainz:getCoverData'>;
  musicbrainzAutodetect: BoundIpcMethod<'musicbrainz:autodetect'>;
  musicbrainzBatchApply: BoundIpcMethod<'musicbrainz:batchApply'>;
  listEmbeddedSubtitles: BoundIpcMethod<'subtitles:listEmbedded'>;
  extractEmbeddedSubtitle: BoundIpcMethod<'subtitles:extractEmbedded'>;
  findExternalSubtitles: BoundIpcMethod<'subtitles:findExternal'>;
  readSubtitleFile: BoundIpcMethod<'subtitles:readFile'>;
  extractSubtitleFonts: BoundIpcMethod<'subtitles:extractAttachments'>;
  getPlaybackPosition: BoundIpcMethod<'playback:getPosition'>;
  setPlaybackPosition: BoundIpcMethod<'playback:setPosition'>;
  clearPlaybackPosition: BoundIpcMethod<'playback:clearPosition'>;

  // audio PiP
  audioPipShow: BoundIpcMethod<'audio-pip:show'>;
  audioPipHide: BoundIpcMethod<'audio-pip:hide'>;
  audioPipAutoHide: BoundIpcMethod<'audio-pip:autoHide'>;
  audioPipPrewarm: BoundIpcMethod<'audio-pip:prewarm'>;
  audioPipUpdate: BoundIpcMethod<'audio-pip:update'>;
  audioPipPreviewStart: BoundIpcMethod<'audio-pip:previewStart'>;
  audioPipPreviewStop: BoundIpcMethod<'audio-pip:previewStop'>;
  audioPipPreviewUpdate: BoundIpcMethod<'audio-pip:previewUpdate'>;

  // app / library
  getAppInfo: BoundIpcMethod<'app:getInfo'>;
  getLicenses: BoundIpcMethod<'app:getLicenses'>;
  getAutoLaunch: BoundIpcMethod<'app:getAutoLaunch'>;
  setAutoLaunch: BoundIpcMethod<'app:setAutoLaunch'>;
  cancelLibraryScan: BoundIpcMethod<'library:scanCancel'>;

  // online
  youtubeAuthStatus: BoundIpcMethod<'yt:authStatus'>;
  getStreamUrl: BoundIpcMethod<'yt:stream:get'>;
  savedLoad: BoundIpcMethod<'saved:load'>;
  savedSaveTrack: BoundIpcMethod<'saved:saveTrack'>;
  savedRemoveTrack: BoundIpcMethod<'saved:removeTrack'>;
  savedSavePlaylist: BoundIpcMethod<'saved:savePlaylist'>;
  savedRemovePlaylist: BoundIpcMethod<'saved:removePlaylist'>;
  radioLoad: BoundIpcMethod<'radio:load'>;
  radioSave: BoundIpcMethod<'radio:save'>;
  youtubeLogin: BoundIpcMethod<'yt:login'>;
  youtubeLogout: BoundIpcMethod<'yt:logout'>;
  youtubeImportCookies: BoundIpcMethod<'yt:importCookies'>;
  youtubeExportCookies: BoundIpcMethod<'yt:exportCookies'>;
  youtubeSubscriptions: BoundIpcMethod<'yt:subs:list'>;
  youtubeAddSubscription: BoundIpcMethod<'yt:subs:add'>;
  youtubeRemoveSubscription: BoundIpcMethod<'yt:subs:remove'>;
  youtubeUpdateSubscription: BoundIpcMethod<'yt:subs:update'>;
  youtubeCheckSubscriptions: BoundIpcMethod<'yt:subs:checkNow'>;

  // plugins
  pluginsList: BoundIpcMethod<'plugins:list'>;
  pluginsGet: BoundIpcMethod<'plugins:get'>;
  pluginsToggle: BoundIpcMethod<'plugins:toggle'>;
  pluginsUninstall: BoundIpcMethod<'plugins:uninstall'>;
  pluginsInstallFromFolder: BoundIpcMethod<'plugins:installFromFolder'>;
  pluginsStorageKeys: BoundIpcMethod<'plugins:storage:keys'>;
  pluginsStorageGet: BoundIpcMethod<'plugins:storage:get'>;
  pluginsStorageSet: BoundIpcMethod<'plugins:storage:set'>;
  pluginsStorageRemove: BoundIpcMethod<'plugins:storage:remove'>;
  pluginsSettingsGet: BoundIpcMethod<'plugins:settings:get'>;
  pluginsSettingsSet: BoundIpcMethod<'plugins:settings:set'>;
  pluginsFetch: BoundIpcMethod<'plugins:fetch'>;
}
