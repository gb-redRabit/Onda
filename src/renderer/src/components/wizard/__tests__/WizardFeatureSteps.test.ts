import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  deps: null as any,
  refreshing: null as any,
  refreshAll: vi.fn(),
  runInstall: vi.fn(),
  cancelInstall: vi.fn()
}));

vi.mock('@renderer/composables/useDependencies', () => ({
  useDependencies: () => ({
    deps: h.deps,
    refreshing: h.refreshing,
    refreshAll: h.refreshAll,
    runInstall: h.runInstall,
    cancelInstall: h.cancelInstall
  })
}));

const StepStub = defineComponent({
  name: 'WizardStep',
  props: {
    title: { type: String },
    description: { type: String },
    descriptionGap: { type: Boolean }
  },
  template: '<div data-testid="step">{{ title }}{{ description }}</div>'
});

import WizardWelcome from '../WizardWelcome.vue';
import WizardAudio from '../WizardAudio.vue';
import WizardDependencies from '../WizardDependencies.vue';

function mountWithStep(component: unknown, props: Record<string, unknown> = {}) {
  return mount(component as never, {
    props: props as never,
    global: {
      mocks: {
        $t: (key: string, params?: object) => `${key}${params ? JSON.stringify(params) : ''}`
      },
      stubs: { WizardStep: StepStub }
    }
  });
}

describe('WizardWelcome', () => {
  it('renders the intro and every feature', () => {
    const wrapper = mountWithStep(WizardWelcome);

    expect(wrapper.text()).toContain('wizard.title');
    expect(wrapper.text()).toContain('wizard.welcomeIntro');
    expect(wrapper.text()).toContain('wizard.featLibrary');
    expect(wrapper.text()).toContain('wizard.featPipDesc');
    expect(wrapper.findAll('.grid > div')).toHaveLength(6);
  });
});

describe('WizardAudio', () => {
  it('renders four feature cards and the note', () => {
    const wrapper = mountWithStep(WizardAudio);

    expect(wrapper.text()).toContain('wizard.audioTitle');
    expect(wrapper.text()).toContain('wizard.audioEditor');
    expect(wrapper.text()).toContain('wizard.audioNote');
    expect(wrapper.findAll('.space-y-2\\.5 > div')).toHaveLength(4);
  });
});

type Dep = Record<string, unknown>;

function dep(over: Dep = {}): Dep {
  return {
    name: 'yt-dlp',
    description: 'Downloader',
    installed: false,
    version: '',
    installing: false,
    percent: 0,
    error: '',
    ...over
  };
}

function mountDeps(deps: Dep[], refreshing = false) {
  h.deps = ref(deps);
  h.refreshing = ref(refreshing);
  return mountWithStep(WizardDependencies);
}

beforeEach(() => {
  h.refreshAll.mockClear();
  h.runInstall.mockClear();
  h.cancelInstall.mockClear();
});

describe('WizardDependencies', () => {
  it('renders dependency rows with install state', () => {
    const wrapper = mountDeps([
      dep({ name: 'yt-dlp', installed: false }),
      dep({ name: 'ffmpeg', installed: true, version: '7.1' })
    ]);
    const text = wrapper.text();

    expect(text).toContain('wizard.dependenciesTitle');
    expect(text).toContain('yt-dlp');
    expect(text).toContain('Downloader');
    expect(text).toContain('settings.depInstall');
    expect(text).toContain('v7.1');
    expect(wrapper.findAll('.bg-success')).toHaveLength(1);
    expect(wrapper.findAll('.bg-error')).toHaveLength(1);
  });

  it('shows a plain installed label without a version', () => {
    expect(mountDeps([dep({ installed: true })]).text()).toContain('settings.depInstalled');
  });

  it('refreshes and disables the button while refreshing', async () => {
    const idle = mountDeps([dep()]);
    await idle.get('button').trigger('click');
    expect(h.refreshAll).toHaveBeenCalledTimes(1);

    const busy = mountDeps([dep()], true);
    expect(busy.get('button').attributes('disabled')).toBe('');
    expect(busy.find('.animate-spin').exists()).toBe(true);
  });

  it('installs missing dependencies', async () => {
    const wrapper = mountDeps([dep()]);
    const install = wrapper.findAll('button').find((b) => b.text() === 'settings.depInstall')!;

    await install.trigger('click');

    expect(h.runInstall).toHaveBeenCalledWith(expect.objectContaining({ name: 'yt-dlp' }), false);
  });

  it('shows progress and cancels an install', async () => {
    const wrapper = mountDeps([dep({ installing: true, percent: 42 })]);
    const text = wrapper.text();

    expect(text).toContain('42%');
    expect(wrapper.find('.h-1\\.5 .bg-primary').attributes('style')).toContain('width: 42%');

    const cancel = wrapper.findAll('button').find((b) => b.text() === 'settings.depCancel')!;
    await cancel.trigger('click');
    expect(h.cancelInstall).toHaveBeenCalledWith(expect.objectContaining({ name: 'yt-dlp' }));
  });

  it('shows errors', () => {
    const wrapper = mountDeps([dep({ error: 'failed to install' })]);

    expect(wrapper.text()).toContain('failed to install');
  });
});
