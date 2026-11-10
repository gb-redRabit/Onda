import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  player: null as any,
  moveAbA: vi.fn(),
  moveAbB: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));

import AbRepeatMarkers from '../AbRepeatMarkers.vue';

let wrapper: VueWrapper | null = null;

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(AbRepeatMarkers, {
    props: { duration: 60, ...props },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function stubRect() {
  const root = wrapper!.get('[data-testid="ab-markers"]').element as HTMLElement;
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    width: 200
  } as DOMRect);
  return root;
}

async function firePointer(el: Element, type: string, clientX = 0): Promise<void> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  el.dispatchEvent(event);
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  h.moveAbA.mockReset();
  h.moveAbB.mockReset();
  h.player = reactive({
    abA: null,
    abB: null,
    abActive: false,
    moveAbA: h.moveAbA,
    moveAbB: h.moveAbB
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    writable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders nothing without an A point', () => {
    setup();
    expect(wrapper!.find('[data-testid="ab-markers"]').exists()).toBe(false);
  });

  it('shows the A marker alone', () => {
    h.player.abA = 15;
    setup();

    expect(wrapper!.get('[data-testid="ab-marker-a"]').attributes('style')).toContain('left: 25%');
    expect(wrapper!.find('[data-testid="ab-marker-b"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="ab-band"]').exists()).toBe(false);
  });

  it('renders the highlight band between A and B', () => {
    h.player.abA = 15;
    h.player.abB = 45;
    setup();

    const band = wrapper!.get('[data-testid="ab-band"]');
    expect(band.attributes('style')).toContain('left: 25%');
    expect(band.attributes('style')).toContain('width: 50%');
    expect(band.classes()).toContain('bg-primary/25');
    expect(wrapper!.get('[data-testid="ab-marker-b"]').attributes('style')).toContain('left: 75%');
  });

  it('highlights the band while active', () => {
    h.player.abA = 0;
    h.player.abB = 60;
    h.player.abActive = true;
    setup();

    expect(wrapper!.get('[data-testid="ab-band"]').classes()).toContain('bg-primary/40');
  });

  it('clamps an inverted band to zero width', () => {
    h.player.abA = 45;
    h.player.abB = 15;
    setup();

    expect(wrapper!.get('[data-testid="ab-band"]').attributes('style')).toContain('width: 0%');
  });

  it('hides percentages without a valid duration', () => {
    h.player.abA = 15;
    h.player.abB = 45;
    setup({ duration: 0 });

    expect(wrapper!.find('[data-testid="ab-marker-a"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="ab-marker-b"]').exists()).toBe(false);
  });
});

describe('dragging', () => {
  it('moves the A marker and stops at pointer up', async () => {
    h.player.abA = 15;
    h.player.abB = 45;
    setup();
    stubRect();
    const marker = wrapper!.get('[data-testid="ab-marker-a"]');

    await firePointer(marker.element, 'pointerdown');
    await firePointer(marker.element, 'pointermove', 200);
    expect(h.moveAbA).toHaveBeenLastCalledWith(30);

    await firePointer(marker.element, 'pointerup');
    await firePointer(marker.element, 'pointermove', 300);
    expect(h.moveAbA).toHaveBeenCalledTimes(1);
  });

  it('moves the B marker and handles pointer cancel', async () => {
    h.player.abA = 15;
    h.player.abB = 45;
    setup();
    stubRect();
    const marker = wrapper!.get('[data-testid="ab-marker-b"]');

    await firePointer(marker.element, 'pointerdown');
    await firePointer(marker.element, 'pointermove', 300);
    expect(h.moveAbB).toHaveBeenCalledWith(60);

    await firePointer(marker.element, 'pointercancel');
    await firePointer(marker.element, 'pointermove', 120);
    expect(h.moveAbB).toHaveBeenCalledTimes(1);
  });

  it('clamps the pointer position to the bar', async () => {
    h.player.abA = 15;
    setup();
    stubRect();
    const marker = wrapper!.get('[data-testid="ab-marker-a"]');

    await firePointer(marker.element, 'pointerdown');
    await firePointer(marker.element, 'pointermove', -500);
    await firePointer(marker.element, 'pointermove', 5000);

    expect(h.moveAbA).toHaveBeenNthCalledWith(1, 0);
    expect(h.moveAbA).toHaveBeenNthCalledWith(2, 60);
  });

  it('ignores movement without a drag', async () => {
    h.player.abA = 15;
    setup();
    stubRect();

    await firePointer(wrapper!.get('[data-testid="ab-marker-a"]').element, 'pointermove', 200);

    expect(h.moveAbA).not.toHaveBeenCalled();
  });
});
