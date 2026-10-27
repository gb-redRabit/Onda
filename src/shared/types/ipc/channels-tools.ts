import type {
  ImageStudioEstimateRequest,
  ImageStudioEstimateResult,
  ImageStudioLoadResult,
  ImageStudioSaveRequest,
  ImageStudioSaveResult,
  MediaConvertRequest,
  MediaConvertResult,
  TagEditorFile,
  TagEditorWriteEntry,
  TagEditorWriteResult,
  ToolId,
  ToolMessageInput,
  ToolWindowContext,
  VideoClipRequest,
  VideoClipThumbnailsRequest,
  VideoClipThumbnailsResult,
  VideoConcatRequest
} from '../tools';

export interface ToolsChannels {
  'tools:openWindow': {
    args: [toolId: ToolId, params?: Record<string, unknown>];
    result: number | null;
  };
  'tools:getContext': { args: []; result: ToolWindowContext | null };
  'tools:sendToMain': { args: [message: ToolMessageInput]; result: boolean };
  'tools:convert': { args: [request: MediaConvertRequest]; result: MediaConvertResult };
  'tools:cancel': { args: [jobId: string]; result: boolean };
  'tools:clip': { args: [request: VideoClipRequest]; result: MediaConvertResult };
  'tools:clipCancel': { args: [jobId: string]; result: boolean };
  'tools:concat': { args: [request: VideoConcatRequest]; result: MediaConvertResult };
  'tools:concatCancel': { args: [jobId: string]; result: boolean };
  'tools:clipThumbnails': {
    args: [request: VideoClipThumbnailsRequest];
    result: VideoClipThumbnailsResult;
  };
  'tools:tagEditorRead': { args: [paths: string[]]; result: TagEditorFile[] };
  'tools:tagEditorWrite': {
    args: [entries: TagEditorWriteEntry[]];
    result: TagEditorWriteResult[];
  };
  'tools:imageRead': { args: [path: string]; result: ImageStudioLoadResult };
  'tools:imageSave': { args: [request: ImageStudioSaveRequest]; result: ImageStudioSaveResult };
  'tools:imageEstimate': {
    args: [request: ImageStudioEstimateRequest];
    result: ImageStudioEstimateResult;
  };
}
