import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  updateAppearance: vi.fn(),
  nudge: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/audioLayoutNudge', () => ({ nudgeElement: h.nudge }));

import { useAudioElementDrag } from '../useAudioElementDrag';

function element(overrides: Record<string, unknown> = {}) {
  return { id: 'cover', x: 10, y: 20, ...overrides } as never;
}

function mouse(overrides: Record<string, unknown> = {}) {
  return {
    clientX: 0,
    clientY: 0,
    currentTarget: {
      getBoundingClientRect: () => ({ width: 200, height: 100 })
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    shiftKey: false,
    key: '',
    ...overrides
  } as unknown as MouseEvent;
}

function keyboard(key: string, shiftKey = false) {
  return {
    key,
    shiftKey,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent;
}

beforeEach(() => {
  h.updateAppearance.mockReset();
  h.nudge.mockReset();
  h.settings = {
    appearance: {
      audioLayout: {
        elements: [
          { id: 'cover', x: 10, y: 20 },
          { id: 'title', x: 30, y: 40 }
        ]
      }
    },
    updateAppearance: h.updateAppearance
  };
});

describe('mouse dragging', () => {
  it('ignores drags outside fullscreen and the visualization element', () => {
    const fullscreen = ref(false);
    const drag = useAudioElementDrag(fullscreen);
    const event = mouse();

    drag.onElementMouseDown(event, element());
    expect(drag.dragging.value).toBeNull();

    fullscreen.value = true;
    drag.onElementMouseDown(event, element({ id: 'visualization' }));
    expect(drag.dragging.value).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('captures the start position and computes a clamped drag position', () => {
    const drag = useAudioElementDrag(ref(true));
    const down = mouse({ clientX: 50, clientY: 30 });

    drag.onElementMouseDown(down, element());
    expect(down.preventDefault).toHaveBeenCalled();
    expect(down.stopPropagation).toHaveBeenCalled();
    expect(drag.dragging.value).toMatchObject({
      id: 'cover',
      startX: 50,
      startY: 30,
      elX: 10,
      elY: 20
    });

    drag.onDragMouseMove(mouse({ clientX: 100, clientY: 80 }));
    expect(drag.dragPos.value).toEqual({ id: 'cover', x: 35, y: 70 });
  });

  it('clamps drag positions to the canvas bounds', () => {
    const drag = useAudioElementDrag(ref(true));
    drag.onElementMouseDown(mouse({ clientX: 0, clientY: 0 }), element({ x: 0, y: 0 }));

    drag.onDragMouseMove(mouse({ clientX: -500, clientY: -500 }));
    expect(drag.dragPos.value).toMatchObject({ x: 0, y: 0 });

    drag.onDragMouseMove(mouse({ clientX: 5000, clientY: 5000 }));
    expect(drag.dragPos.value).toMatchObject({ x: 95, y: 95 });
  });

  it('ignores movement without a drag', () => {
    const drag = useAudioElementDrag(ref(true));
    drag.onDragMouseMove(mouse({ clientX: 100 }));

    expect(drag.dragPos.value).toBeNull();
  });

  it('commits the position on mouse up', () => {
    const drag = useAudioElementDrag(ref(true));
    drag.onElementMouseDown(mouse(), element());
    drag.onDragMouseMove(mouse({ clientX: 100 }));

    drag.onDragMouseUp();

    expect(h.updateAppearance).toHaveBeenCalledWith({
      audioLayout: {
        elements: [
          { id: 'cover', x: 60, y: 20 },
          { id: 'title', x: 30, y: 40 }
        ]
      }
    });
    expect(drag.dragging.value).toBeNull();
    expect(drag.dragPos.value).toBeNull();
  });

  it('does not commit without a drag position', () => {
    const drag = useAudioElementDrag(ref(true));
    drag.onDragMouseUp();

    expect(h.updateAppearance).not.toHaveBeenCalled();
  });

  it('handles a missing audio layout', () => {
    h.settings.appearance.audioLayout = undefined;
    const drag = useAudioElementDrag(ref(true));
    drag.onElementMouseDown(mouse(), element());
    drag.onDragMouseMove(mouse());
    drag.onDragMouseUp();

    expect(h.updateAppearance).toHaveBeenCalledWith({ audioLayout: { elements: [] } });
  });
});

describe('keyboard nudging', () => {
  it('ignores keys outside fullscreen and on the visualization element', () => {
    const fullscreen = ref(false);
    const drag = useAudioElementDrag(fullscreen);
    const event = keyboard('ArrowRight');

    drag.onElementKeydown(event, element());
    expect(h.nudge).not.toHaveBeenCalled();

    fullscreen.value = true;
    drag.onElementKeydown(event, element({ id: 'visualization' }));
    expect(h.nudge).not.toHaveBeenCalled();
  });

  it('ignores unhandled keys and unchanged positions', () => {
    const drag = useAudioElementDrag(ref(true));
    h.nudge.mockReturnValueOnce(null);
    const unhandled = keyboard('Enter');
    drag.onElementKeydown(unhandled, element());
    expect(unhandled.preventDefault).not.toHaveBeenCalled();

    h.nudge.mockReturnValueOnce({ x: 10, y: 20 });
    const unchanged = keyboard('ArrowLeft');
    drag.onElementKeydown(unchanged, element());
    expect(unchanged.preventDefault).toHaveBeenCalled();
    expect(h.updateAppearance).not.toHaveBeenCalled();
  });

  it('moves the element and commits the new position', () => {
    const drag = useAudioElementDrag(ref(true));
    h.nudge.mockReturnValueOnce({ x: 15, y: 25 });
    const event = keyboard('ArrowRight', true);

    drag.onElementKeydown(event, element());

    expect(h.nudge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cover' }),
      'ArrowRight',
      true
    );
    expect(event.preventDefault).toHaveBeenCalled();
    expect(h.updateAppearance).toHaveBeenCalledWith({
      audioLayout: {
        elements: [
          { id: 'cover', x: 15, y: 25 },
          { id: 'title', x: 30, y: 40 }
        ]
      }
    });
  });
});
