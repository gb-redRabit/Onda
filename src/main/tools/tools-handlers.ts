import { ipcMain, type BrowserWindow } from 'electron';
import type {
  MediaConvertRequest,
  MediaConvertResult,
  VideoClipRequest,
  VideoClipThumbnailsRequest,
  VideoConcatRequest
} from '../../shared/types/tools';
import { cancelMediaConvert, convertMedia } from './media-convert';
import {
  cancelVideoClip,
  cancelVideoConcat,
  clipThumbnails,
  clipVideo,
  concatVideos
} from './video-clip';
import {
  getToolWindowContext,
  isToolId,
  openToolWindow,
  sendToolMessageToMain
} from './tool-windows';

export interface ToolsHandlerContext {
  getMainWindow: () => BrowserWindow | null;
}

export function registerToolsHandlers(context: ToolsHandlerContext): void {
  ipcMain.handle('tools:openWindow', (_event, toolId: unknown, params: unknown) =>
    isToolId(toolId) ? openToolWindow(toolId, params, context.getMainWindow()) : null
  );
  ipcMain.handle('tools:getContext', (event) => getToolWindowContext(event.sender));
  ipcMain.handle('tools:sendToMain', (event, message: unknown) =>
    sendToolMessageToMain(event.sender, message, context.getMainWindow())
  );
  ipcMain.handle(
    'tools:convert',
    async (event, request: MediaConvertRequest): Promise<MediaConvertResult> =>
      convertMedia(event.sender, request)
  );
  ipcMain.handle('tools:cancel', async (_event, jobId: string): Promise<boolean> =>
    cancelMediaConvert(jobId)
  );
  ipcMain.handle(
    'tools:clip',
    async (event, request: VideoClipRequest): Promise<MediaConvertResult> =>
      clipVideo(event.sender, request)
  );
  ipcMain.handle('tools:clipCancel', async (_event, jobId: string): Promise<boolean> =>
    cancelVideoClip(jobId)
  );
  ipcMain.handle(
    'tools:concat',
    async (event, request: VideoConcatRequest): Promise<MediaConvertResult> =>
      concatVideos(event.sender, request)
  );
  ipcMain.handle('tools:concatCancel', async (_event, jobId: string): Promise<boolean> =>
    cancelVideoConcat(jobId)
  );
  ipcMain.handle('tools:clipThumbnails', async (_event, request: VideoClipThumbnailsRequest) =>
    clipThumbnails(request)
  );
}
