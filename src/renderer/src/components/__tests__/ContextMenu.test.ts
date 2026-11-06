import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';

// Menu kontekstowe: store UI jest podstawiony, a DOM sprawdzamy przez document.body
// (komponent teleportuje menu i podmenu).
const state = vi.hoisted(() => ({
  ui: null as any,
  hide: vi.fn(),
  action: vi.fn(),
  childAction: vi.fn()
}));

vi.mock('@renderer/stores/ui', () => ({
  CONTEXT_MENU_WIDTH: 200,
  useUIStore: () => state.ui
}));
vi.mock('@lucide/vue', () => ({ ChevronRight: { template: '<span />' } }));

const { default: ContextMenu } = await import('../ContextMenu.vue');

function menuItems() {
  return [
    { label: 'Open', action: state.action, shortcut: 'Ctrl+O' },
    { label: 'Checked', checked: true, action: state.action },
    { label: 'Disabled', disabled: true, action: state.action },
    { separator: true },
    {
      label: 'Submenu',
      children: [
        { label: 'Child A', action: state.childAction },
        { label: 'Child B', disabled: true },
        { separator: true },
        { label: 'Child C', action: state.childAction }
      ]
    }
  ];
}

let wrapper: VueWrapper | null = null;

function openMenu(items = menuItems(), x = 10, y = 20) {
  state.ui.contextMenu = { x, y, items };
  return flush();
}

function menuEl(): HTMLElement | null {
  return document.body.querySelector('#context-menu');
}

function items(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[data-testid="context-menu-item"]'));
}

function subitems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[data-testid="context-menu-subitem"]'));
}

function key(name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, bubbles: true, ...init });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.ui = reactive({
    contextMenu: null as null | { x: number; y: number; items: unknown[] },
    hideContextMenu: vi.fn(() => {
      state.ui.contextMenu = null;
    })
  });
  state.action.mockClear();
  state.childAction.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
    writable: true
  });
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('rendering', () => {
  it('renders nothing without a menu', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await nextTick();
    expect(menuEl()).toBeNull();
  });

  it('renders items, separators and ARIA state', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    const rendered = items();
    expect(rendered).toHaveLength(4);
    expect(document.body.querySelectorAll('.border-t')).toHaveLength(1);
    expect(rendered[0].getAttribute('role')).toBe('menuitem');
    expect(rendered[0].textContent).toContain('Ctrl+O');
    expect(rendered[1].getAttribute('role')).toBe('menuitemcheckbox');
    expect(rendered[1].getAttribute('aria-checked')).toBe('true');
    expect((rendered[2] as HTMLButtonElement).disabled).toBe(true);
    expect(rendered[3].getAttribute('aria-haspopup')).toBe('menu');
    expect(rendered[3].getAttribute('aria-expanded')).toBe('false');
  });

  it('clamps the menu position to the viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
    wrapper = mount(ContextMenu, { attachTo: document.body });

    await openMenu(menuItems(), 500, 400);
    const el = menuEl()!;
    expect(el.style.left).toBe('192px');
    expect(el.style.top).toBe('106px');
    expect(el.style.maxHeight).toBe('284px');
  });
});

describe('mouse actions', () => {
  it('runs an item action, hides the menu and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    items()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(state.action).toHaveBeenCalled();
    expect(state.ui.hideContextMenu).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('marks disabled items and exposes their state', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    expect((items()[2] as HTMLButtonElement).disabled).toBe(true);
    expect(items()[2].className).toContain('opacity-40');
  });

  it('opens a submenu on click and runs child actions', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    items()[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(subitems()).toHaveLength(3);
    expect(items()[3].getAttribute('aria-expanded')).toBe('true');

    subitems()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.childAction).toHaveBeenCalled();
    expect(state.ui.hideContextMenu).toHaveBeenCalled();
  });

  it('opens a submenu after a hover delay and cancels it on leave before the delay', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    items()[3].parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
    items()[3].parentElement!.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(subitems()).toHaveLength(0);

    items()[3].parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(120);
    await flush();
    expect(subitems()).toHaveLength(3);
  });

  it('closes on outside mousedown but not inside menu or submenu', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();
    items()[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    menuEl()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.contextMenu).not.toBeNull();

    document.body
      .querySelector('#context-submenu')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.contextMenu).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(state.ui.contextMenu).toBeNull();
  });

  it('closes on window scroll outside the menu and ignores inner scroll', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    menuEl()!.dispatchEvent(new Event('scroll'));
    expect(state.ui.contextMenu).not.toBeNull();

    window.dispatchEvent(new Event('resize'));
    expect(state.ui.contextMenu).toBeNull();
  });
});

describe('keyboard', () => {
  it('moves the active item with arrows, Home and End', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    window.dispatchEvent(key('ArrowDown'));
    await nextTick();
    expect(items()[1].className).toContain('bg-primary/10');

    window.dispatchEvent(key('ArrowUp'));
    await nextTick();
    expect(items()[0].className).toContain('bg-primary/10');

    window.dispatchEvent(key('End'));
    await nextTick();
    expect(items()[3].className).toContain('bg-primary/10');

    window.dispatchEvent(key('Home'));
    await nextTick();
    expect(items()[0].className).toContain('bg-primary/10');
  });

  it('runs the active item on Enter and opens submenus', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    window.dispatchEvent(key('Enter'));
    await nextTick();
    expect(state.action).toHaveBeenCalledTimes(1);

    await openMenu();
    window.dispatchEvent(key('End'));
    await nextTick();
    window.dispatchEvent(key('Enter'));
    await flush();
    expect(subitems()).toHaveLength(3);
  });

  it('opens a submenu with ArrowRight and handles submenu keys', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();
    window.dispatchEvent(key('End'));
    await nextTick();

    window.dispatchEvent(key('ArrowRight'));
    await flush();
    expect(subitems()).toHaveLength(3);
    expect(document.activeElement).toBe(subitems()[0]);

    window.dispatchEvent(key('ArrowDown'));
    await nextTick();
    expect(document.activeElement).toBe(subitems()[2]);

    window.dispatchEvent(key('Home'));
    await nextTick();
    expect(document.activeElement).toBe(subitems()[0]);

    window.dispatchEvent(key('End'));
    await nextTick();
    expect(document.activeElement).toBe(subitems()[2]);

    window.dispatchEvent(key('ArrowLeft'));
    await nextTick();
    expect(subitems()).toHaveLength(0);
  });

  it('closes on Escape and restores focus, and lets Tab pass', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    window.dispatchEvent(key('Escape'));
    expect(state.ui.hideContextMenu).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    await openMenu();
    const tab = key('Tab');
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(state.ui.contextMenu).toBeNull();
  });

  it('supports type-ahead and ignores modifiers', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    window.dispatchEvent(key('c'));
    await nextTick();
    expect(document.activeElement).toBe(items()[1]);

    window.dispatchEvent(key('s'));
    await vi.advanceTimersByTimeAsync(600);
    await nextTick();
    expect(document.activeElement).toBe(items()[3]);

    window.dispatchEvent(key('o', { ctrlKey: true }));
    await nextTick();
    expect(document.activeElement).toBe(items()[3]);

    window.dispatchEvent(key('1', { metaKey: true }));
    await nextTick();
    expect(state.ui.contextMenu).not.toBeNull();
  });

  it('ignores non-alphanumeric type-ahead keys', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    const event = key('F1');
    window.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(items()[0]);
  });
});

describe('lifecycle', () => {
  it('focuses the first selectable item when opened', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    expect(focusSpy).toHaveBeenCalled();
    expect(focusSpy.mock.contexts.at(-1)).toBe(items()[0]);
  });

  it('removes listeners and clears timers on unmount', async () => {
    wrapper = mount(ContextMenu, { attachTo: document.body });
    await openMenu();

    items()[3].parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
    wrapper.unmount();
    wrapper = null;

    window.dispatchEvent(key('Escape'));
    await vi.advanceTimersByTimeAsync(1000);
    // Po odmontowaniu nie ma już reakcji na klawisze ani otwarcia podmenu.
    expect(document.body.querySelector('#context-submenu')).toBeNull();
  });
});
