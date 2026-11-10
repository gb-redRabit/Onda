import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  getMainWindow: vi.fn(() => ({ id: 'main' })),
  openToolWindow: vi.fn((id: string, params: unknown, main: unknown) => ({ id, params, main })),
  getToolWindowContext: vi.fn(() => ({ toolId: 'converter' })),
  sendToolMessageToMain: vi.fn(() => true),
  convertMedia: vi.fn(async () => ({ success: true })),
  cancelMediaConvert: vi.fn(() => true),
  batchConvertImages: vi.fn(async () => ({ queued: 2 })),
  cancelBatchImages: vi.fn(() => true),
  exportHistory: vi.fn(async () => ({ success: true })),
  estimateEditedImage: vi.fn(async () => ({ success: true })),
  readImageForEditing: vi.fn(async () => ({ success: true })),
  saveEditedImage: vi.fn(async () => ({ success: true })),
  readAudioTags: vi.fn(async () => []),
  writeAudioTags: vi.fn(async () => true),
  cancelVideoClip: vi.fn(() => true),
  cancelVideoConcat: vi.fn(() => true),
  clipThumbnails: vi.fn(async () => ['thumb']),
  clipVideo: vi.fn(async () => ({ success: true })),
  concatVideos: vi.fn(async () => ({ success: true })),
  isToolId: vi.fn((id: unknown) => id === 'converter' || id === 'image-studio')
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      h.handlers.set(channel, handler);
    }
  }
}));
vi.mock('../media-convert', () => ({
  convertMedia: h.convertMedia,
  cancelMediaConvert: h.cancelMediaConvert
}));
vi.mock('../batch-images', () => ({
  batchConvertImages: h.batchConvertImages,
  cancelBatchImages: h.cancelBatchImages
}));
vi.mock('../history-export', () => ({ exportHistory: h.exportHistory }));
vi.mock('../image-studio', () => ({
  estimateEditedImage: h.estimateEditedImage,
  readImageForEditing: h.readImageForEditing,
  saveEditedImage: h.saveEditedImage
}));
vi.mock('../tag-editor', () => ({
  readAudioTags: h.readAudioTags,
  writeAudioTags: h.writeAudioTags
}));
vi.mock('../video-clip', () => ({
  cancelVideoClip: h.cancelVideoClip,
  cancelVideoConcat: h.cancelVideoConcat,
  clipThumbnails: h.clipThumbnails,
  clipVideo: h.clipVideo,
  concatVideos: h.concatVideos
}));
vi.mock('../tool-windows', () => ({
  getToolWindowContext: h.getToolWindowContext,
  isToolId: h.isToolId,
  openToolWindow: h.openToolWindow,
  sendToolMessageToMain: h.sendToolMessageToMain
}));

import { registerToolsHandlers } from '../tools-handlers';

const event = { sender: { id: 'renderer' } };
const mainWindow = { id: 'main' };

function call(channel: string, ...args: unknown[]) {
  return h.handlers.get(channel)!(event, ...args);
}

beforeEach(() => {
  h.handlers.clear();
  for (const fn of Object.values(h)) {
    if (typeof fn === 'function' && 'mockClear' in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
  }
  h.isToolId.mockImplementation((id: unknown) => id === 'converter' || id === 'image-studio');
  h.getMainWindow.mockReturnValue(mainWindow as never);
  registerToolsHandlers({ getMainWindow: h.getMainWindow as never });
});

describe('registration', () => {
  it('registers every tools channel', () => {
    expect([...h.handlers.keys()]).toEqual([
      'tools:openWindow',
      'tools:getContext',
      'tools:sendToMain',
      'tools:convert',
      'tools:cancel',
      'tools:clip',
      'tools:clipCancel',
      'tools:concat',
      'tools:concatCancel',
      'tools:clipThumbnails',
      'tools:tagEditorRead',
      'tools:tagEditorWrite',
      'tools:imageRead',
      'tools:imageSave',
      'tools:imageEstimate',
      'tools:batchImagesStart',
      'tools:batchImagesCancel',
      'tools:exportHistory'
    ]);
  });
});

describe('window and messaging', () => {
  it('opens tool windows only for known ids', () => {
    expect(call('tools:openWindow', 'converter', { paths: ['a'] })).toEqual({
      id: 'converter',
      params: { paths: ['a'] },
      main: mainWindow
    });
    expect(h.openToolWindow).toHaveBeenCalledWith('converter', { paths: ['a'] }, mainWindow);

    expect(call('tools:openWindow', 'nope', {})).toBeNull();
    expect(h.openToolWindow).toHaveBeenCalledTimes(1);
  });

  it('delegates context and messages', () => {
    expect(call('tools:getContext')).toEqual({ toolId: 'converter' });
    expect(h.getToolWindowContext).toHaveBeenCalledWith(event.sender);

    expect(call('tools:sendToMain', { type: 'hello' })).toBe(true);
    expect(h.sendToolMessageToMain).toHaveBeenCalledWith(
      event.sender,
      { type: 'hello' },
      mainWindow
    );
  });
});

describe('media tools', () => {
  it('delegates conversion, clipping and concatenation', async () => {
    await expect(call('tools:convert', { input: 'a.mp3' })).resolves.toEqual({ success: true });
    expect(h.convertMedia).toHaveBeenCalledWith(event.sender, { input: 'a.mp3' });
    await expect(call('tools:cancel', 'job-1')).resolves.toBe(true);
    expect(h.cancelMediaConvert).toHaveBeenCalledWith('job-1');

    await expect(call('tools:clip', { input: 'v.mp4' })).resolves.toEqual({ success: true });
    expect(h.clipVideo).toHaveBeenCalledWith(event.sender, { input: 'v.mp4' });
    await expect(call('tools:clipCancel', 'clip-1')).resolves.toBe(true);
    expect(h.cancelVideoClip).toHaveBeenCalledWith('clip-1');

    await expect(call('tools:concat', { inputs: [] })).resolves.toEqual({ success: true });
    expect(h.concatVideos).toHaveBeenCalledWith(event.sender, { inputs: [] });
    await expect(call('tools:concatCancel', 'concat-1')).resolves.toBe(true);
    expect(h.cancelVideoConcat).toHaveBeenCalledWith('concat-1');

    await expect(call('tools:clipThumbnails', { input: 'v.mp4' })).resolves.toEqual(['thumb']);
    expect(h.clipThumbnails).toHaveBeenCalledWith({ input: 'v.mp4' });
  });
});

describe('metadata and image tools', () => {
  it('delegates tag editor calls', async () => {
    await expect(call('tools:tagEditorRead', ['a.mp3'])).resolves.toEqual([]);
    expect(h.readAudioTags).toHaveBeenCalledWith(['a.mp3']);
    await expect(call('tools:tagEditorWrite', [{ path: 'a.mp3' }])).resolves.toBe(true);
    expect(h.writeAudioTags).toHaveBeenCalledWith([{ path: 'a.mp3' }]);
  });

  it('delegates image studio calls', async () => {
    await expect(call('tools:imageRead', 'a.png')).resolves.toEqual({ success: true });
    expect(h.readImageForEditing).toHaveBeenCalledWith('a.png');
    await expect(call('tools:imageSave', { png: [] })).resolves.toEqual({ success: true });
    expect(h.saveEditedImage).toHaveBeenCalledWith({ png: [] });
    await expect(call('tools:imageEstimate', { png: [] })).resolves.toEqual({ success: true });
    expect(h.estimateEditedImage).toHaveBeenCalledWith({ png: [] });
  });

  it('delegates batch images and history export', async () => {
    await expect(call('tools:batchImagesStart', { paths: [] })).resolves.toEqual({ queued: 2 });
    expect(h.batchConvertImages).toHaveBeenCalledWith(event.sender, { paths: [] });
    await expect(call('tools:batchImagesCancel', 'batch-1')).resolves.toBe(true);
    expect(h.cancelBatchImages).toHaveBeenCalledWith('batch-1');

    await expect(call('tools:exportHistory', { format: 'json' })).resolves.toEqual({
      success: true
    });
    expect(h.exportHistory).toHaveBeenCalledWith(event, { format: 'json' });
  });
});
