import { describe, it, expect, afterEach, vi } from 'vitest';
import { openPreviewWindow } from '../previewWindow';

const originalApi = window.api;

afterEach(() => {
  window.api = originalApi;
});

function stubInvoke(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockResolvedValue({ success: true });
  window.api = { invoke } as unknown as Window['api'];
  return invoke;
}

describe('openPreviewWindow', () => {
  it('invokes preview:open with url and optional title', async () => {
    const invoke = stubInvoke();
    await openPreviewWindow('https://player.example/v/1', 'Episode 1');
    expect(invoke).toHaveBeenCalledWith('preview:open', 'https://player.example/v/1', {
      title: 'Episode 1'
    });
  });

  it('omits the title option when not provided', async () => {
    const invoke = stubInvoke();
    await openPreviewWindow('https://player.example/v/2');
    expect(invoke).toHaveBeenCalledWith('preview:open', 'https://player.example/v/2', undefined);
  });

  it('does nothing without a url', async () => {
    const invoke = stubInvoke();
    await openPreviewWindow(undefined, 'x');
    await openPreviewWindow('', 'x');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('swallows IPC failures (best-effort)', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('boom'));
    window.api = { invoke } as unknown as Window['api'];
    await expect(openPreviewWindow('https://player.example/v/3')).resolves.toBeUndefined();
  });
});
