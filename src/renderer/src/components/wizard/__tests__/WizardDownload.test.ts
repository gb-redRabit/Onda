import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

const StepStub = defineComponent({
  name: 'WizardStep',
  props: { title: { type: String }, description: { type: String } },
  template: '<div data-testid="step">{{ title }}</div>'
});

import WizardDownload from '../WizardDownload.vue';

function mountDownload(over: Record<string, unknown> = {}) {
  h.settings = reactive({
    download: { defaultPath: '', defaultKind: 'audio', ...over },
    updateDownload: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(h.settings.download, patch)
    )
  });
  return mount(WizardDownload, {
    global: { mocks: { $t: (key: string) => key }, stubs: { WizardStep: StepStub } }
  });
}

beforeEach(() => {
  h.settings = null;
});

describe('WizardDownload', () => {
  it('shows the placeholder without a folder', () => {
    const text = mountDownload().text();

    expect(text).toContain('wizard.downloadTitle');
    expect(text).toContain('wizard.noneSelected');
  });

  it('shows the selected download path', () => {
    expect(mountDownload({ defaultPath: 'D:/Downloads' }).text()).toContain('D:/Downloads');
  });

  it('picks a download folder', async () => {
    const invoke = vi.fn().mockResolvedValue(['D:/New']);
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountDownload();
    const choose = wrapper.findAll('button')[0];

    await choose.trigger('click');

    expect(invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ defaultPath: 'D:/New' });
  });

  it('keeps the path when the dialog is cancelled or empty', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountDownload();
    const choose = wrapper.findAll('button')[0];

    await choose.trigger('click');
    await choose.trigger('click');

    expect(h.settings.updateDownload).not.toHaveBeenCalled();
  });

  it('swallows dialog errors', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('cancelled'));
    (window as unknown as { api: { invoke: typeof invoke } }).api = { invoke };
    const wrapper = mountDownload();

    await expect(wrapper.findAll('button')[0].trigger('click')).resolves.toBeUndefined();
    expect(h.settings.updateDownload).not.toHaveBeenCalled();
  });

  it('marks the default kind and switches it', async () => {
    const wrapper = mountDownload({ defaultKind: 'audio' });
    const kinds = wrapper.findAll('button').slice(1);

    expect(kinds).toHaveLength(2);
    expect(kinds[0].classes()).toContain('border-primary');
    expect(kinds[1].classes()).toContain('border-hairline');

    await kinds[1].trigger('click');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ defaultKind: 'video' });
  });
});
