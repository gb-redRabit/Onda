import type { BrowserWindow } from 'electron';
import type {
  MediaConvertRequest,
  MediaConvertResult,
  VideoClipRequest,
  VideoClipThumbnailsRequest,
  VideoConcatRequest
} from '../../shared/types/tools';
import { handleIpc } from '../ipc/typed-handle';
import { cancelMediaConvert, convertMedia } from './media-convert';
import { batchConvertImages, cancelBatchImages } from './batch-images';
import { exportHistory } from './history-export';
import { estimateEditedImage, readImageForEditing, saveEditedImage } from './image-studio';
import { readAudioTags, writeAudioTags } from './tag-editor';
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
  handleIpc('tools:openWindow', (_event, toolId: unknown, params: unknown) =>
    isToolId(toolId) ? openToolWindow(toolId, params, context.getMainWindow()) : null
  );
  handleIpc('tools:getContext', (event) => getToolWindowContext(event.sender));
  handleIpc('tools:sendToMain', (event, message: unknown) =>
    sendToolMessageToMain(event.sender, message, context.getMainWindow())
  );
  handleIpc(
    'tools:convert',
    async (event, request: MediaConvertRequest): Promise<MediaConvertResult> =>
      convertMedia(event.sender, request)
  );
  handleIpc('tools:cancel', async (_event, jobId: string): Promise<boolean> =>
    cancelMediaConvert(jobId)
  );
  handleIpc('tools:clip', async (event, request: VideoClipRequest): Promise<MediaConvertResult> =>
    clipVideo(event.sender, request)
  );
  handleIpc('tools:clipCancel', async (_event, jobId: string): Promise<boolean> =>
    cancelVideoClip(jobId)
  );
  handleIpc(
    'tools:concat',
    async (event, request: VideoConcatRequest): Promise<MediaConvertResult> =>
      concatVideos(event.sender, request)
  );
  handleIpc('tools:concatCancel', async (_event, jobId: string): Promise<boolean> =>
    cancelVideoConcat(jobId)
  );
  handleIpc('tools:clipThumbnails', async (_event, request: VideoClipThumbnailsRequest) =>
    clipThumbnails(request)
  );
  handleIpc('tools:tagEditorRead', async (_event, paths: unknown) => readAudioTags(paths));
  handleIpc('tools:tagEditorWrite', async (_event, entries: unknown) => writeAudioTags(entries));
  handleIpc('tools:imageRead', async (_event, path: unknown) => readImageForEditing(path));
  handleIpc('tools:imageSave', async (_event, request: unknown) => saveEditedImage(request));
  handleIpc('tools:imageEstimate', async (_event, request: unknown) =>
    estimateEditedImage(request)
  );
  handleIpc('tools:batchImagesStart', async (event, request: unknown) =>
    batchConvertImages(event.sender, request)
  );
  handleIpc('tools:batchImagesCancel', async (_event, jobId: string) => cancelBatchImages(jobId));
  handleIpc('tools:exportHistory', async (event, request: unknown) =>
    exportHistory(event, request)
  );
}
