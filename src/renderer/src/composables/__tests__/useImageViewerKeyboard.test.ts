import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { createImageKeyHandler } from '../useImageViewerKeyboard';

function key(name: string, overrides: Record<string, unknown> = {}) {
  return {
    key: name,
    preventDefault: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent;
}

let ctx: any;
let handler: (e: KeyboardEvent) => void;

beforeEach(() => {
  ctx = {
    settingsOpen: ref(false),
    uiVisible: ref(true),
    slideshowActive: ref(false),
    hasPrev: ref(true),
    hasNext: ref(true),
    handleClose: vi.fn(),
    prev: vi.fn(),
    next: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    rotate: vi.fn(),
    toggleFullscreen: vi.fn(),
    stopIdle: vi.fn(),
    toggleSlideshow: vi.fn()
  };
  handler = createImageKeyHandler(ctx);
});

describe('Escape', () => {
  it('closes settings first when they are open', () => {
    ctx.settingsOpen.value = true;

    handler(key('Escape'));

    expect(ctx.settingsOpen.value).toBe(false);
    expect(ctx.handleClose).not.toHaveBeenCalled();
  });

  it('closes the viewer when settings are closed', () => {
    handler(key('Escape'));

    expect(ctx.handleClose).toHaveBeenCalled();
  });
});

describe('navigation and zoom', () => {
  it('navigates with arrows', () => {
    handler(key('ArrowLeft'));
    handler(key('ArrowRight'));

    expect(ctx.prev).toHaveBeenCalled();
    expect(ctx.next).toHaveBeenCalled();
  });

  it('zooms with plus, equals and minus', () => {
    handler(key('+'));
    handler(key('='));
    handler(key('-'));
    handler(key('_'));

    expect(ctx.zoomIn).toHaveBeenCalledTimes(2);
    expect(ctx.zoomOut).toHaveBeenCalledTimes(1);
  });

  it('rotates and toggles fullscreen', () => {
    handler(key('r'));
    handler(key('f'));

    expect(ctx.rotate).toHaveBeenCalled();
    expect(ctx.toggleFullscreen).toHaveBeenCalled();
  });
});

describe('slideshow controls', () => {
  it('toggles UI visibility with H only during slideshow', () => {
    handler(key('h'));
    expect(ctx.uiVisible.value).toBe(true);
    expect(ctx.stopIdle).not.toHaveBeenCalled();

    ctx.slideshowActive.value = true;
    handler(key('h'));
    expect(ctx.uiVisible.value).toBe(false);
    expect(ctx.stopIdle).toHaveBeenCalled();
  });

  it('toggles slideshow on space', () => {
    const event = key(' ');

    handler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(ctx.toggleSlideshow).toHaveBeenCalled();
  });

  it('ignores unrelated keys without preventing default', () => {
    const event = key('x');
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(ctx.handleClose).not.toHaveBeenCalled();
    expect(ctx.prev).not.toHaveBeenCalled();
  });
});
