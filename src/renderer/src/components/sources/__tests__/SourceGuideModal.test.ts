import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  steps: [
    { title: 'Step one', body: 'Open the {editor}' },
    { title: 'Step two', body: 'Paste the {url}' }
  ]
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: h.t,
    tm: (key: string) => (key === 'sources.guide.steps' ? h.steps : [])
  })
}));

import SourceGuideModal from '../SourceGuideModal.vue';

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: ['labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});

let wrapper: VueWrapper | null = null;

function mountGuide() {
  wrapper = mount(SourceGuideModal, {
    global: { stubs: { ModalShell: ModalStub } }
  });
  return wrapper;
}

beforeEach(() => {
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('content', () => {
  it('renders the guide title, intro and numbered steps', () => {
    mountGuide();

    expect(wrapper!.text()).toContain('sources.guide.title');
    expect(wrapper!.text()).toContain('sources.guide.intro');

    const steps = wrapper!.findAll('ol > li');
    expect(steps).toHaveLength(2);
    expect(steps[0].text()).toContain('1');
    expect(steps[0].text()).toContain('Step one');
    expect(steps[0].text()).toContain('Open the {editor}');
    expect(steps[1].text()).toContain('2');
    expect(steps[1].text()).toContain('Step two');
  });

  it('renders no steps when the locale has none', () => {
    h.steps = [];
    mountGuide();

    expect(wrapper!.findAll('ol > li')).toHaveLength(0);
    expect(wrapper!.text()).toContain('sources.guide.title');
  });
});

describe('closing', () => {
  it('emits close from the close button, backdrop and escape', async () => {
    mountGuide();

    await wrapper!.get('[aria-label="common.close"]').trigger('click');
    wrapper!.findComponent(ModalStub).vm.$emit('close');
    wrapper!.findComponent(ModalStub).vm.$emit('escape');

    expect(wrapper!.emitted('close')).toHaveLength(3);
  });
});
