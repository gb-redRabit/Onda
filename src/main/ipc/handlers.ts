import { installIpcGuards } from './guard';
import { registerMusicBrainzHandlers } from './musicbrainz';
import { registerFsHandlers } from './fs-handlers';
import { registerLibraryHandlers } from './library-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerMediaHandlers } from './media-handlers';
import { registerCoverHandlers } from './cover-handlers';
import { registerSubtitleHandlers } from './subtitle-handlers';
import { registerPlaybackHandlers } from './playback-handlers';
import { registerDependencyHandlers } from './dependency-handlers';
import { registerYoutubeHandlers } from './youtube-handlers';
import { registerDialogHandlers } from './dialog-handlers';
import { registerDiagnosticsHandlers } from './diagnostics-handlers';
import { registerUpdaterHandlers } from './updater-handlers';

export function registerIPC(): void {
  installIpcGuards();
  registerFsHandlers();
  registerLibraryHandlers();
  registerSettingsHandlers();
  registerMediaHandlers();
  registerCoverHandlers();
  registerSubtitleHandlers();
  registerPlaybackHandlers();
  registerDependencyHandlers();
  registerYoutubeHandlers();
  registerDialogHandlers();
  registerMusicBrainzHandlers();
  registerDiagnosticsHandlers();
  registerUpdaterHandlers();
}
