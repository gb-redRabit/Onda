import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import SourcesQueryParamsDialog from '../SourcesQueryParamsDialog.vue';

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: ['labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});
const FormFieldStub = defineComponent({
  name: 'FormField',
  props: ['label', 'hint'],
  template: '<div><slot :id="\'params-field\'" /></div>'
});
const ButtonStub = defineComponent({
  name: 'UiButton',
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
});

let wrapper: VueWrapper | null = null;

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(SourcesQueryParamsDialog, {
    props: {
      open: true,
      modelValue: 'a=1\nb=2',
      ...props
    },
    global: {
      stubs: { ModalShell: ModalStub, FormField: FormFieldStub, Button: ButtonStub }
    }
  });
  return wrapper;
}

function textarea() {
  return wrapper!.get('[data-testid="sources-params-input"]');
}

function button(label: string) {
  return wrapper!.findAll('button').find((item) => item.text() === label)!;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('opening', () => {
  it('renders nothing when closed', () => {
    mountDialog({ open: false });

    expect(wrapper!.find('[data-testid="modal"]').exists()).toBe(false);
  });

  it('seeds the draft from the model when opened', async () => {
    mountDialog({ open: false, modelValue: 'first=1' });

    await wrapper!.setProps({ open: true });

    expect((textarea().element as HTMLTextAreaElement).value).toBe('first=1');
  });

  it('does not overwrite the draft while closed', async () => {
    mountDialog({ modelValue: 'seed=1' });
    await textarea().setValue('edited=2');

    await wrapper!.setProps({ modelValue: 'other=3' });

    expect((textarea().element as HTMLTextAreaElement).value).toBe('edited=2');
  });
});

describe('request details', () => {
  it('shows the effective request url when provided', () => {
    mountDialog({ requestUrl: 'https://api.example.com/items?page=2' });

    expect(wrapper!.text()).toContain('sources.requestDetails');
    expect(wrapper!.text()).toContain('https://api.example.com/items?page=2');
  });

  it('hides the details without a request url', () => {
    mountDialog();

    expect(wrapper!.text()).not.toContain('sources.requestDetails');
  });
});

describe('actions', () => {
  it('applies the edited draft and closes', async () => {
    mountDialog();
    await textarea().setValue('key=value');

    await button('sources.applyParams').trigger('click');

    expect(wrapper!.emitted('update:modelValue')).toEqual([['key=value']]);
    expect(wrapper!.emitted('apply')).toHaveLength(1);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('clears the draft without closing', async () => {
    mountDialog();

    await button('common.clear').trigger('click');

    expect((textarea().element as HTMLTextAreaElement).value).toBe('');
    expect(wrapper!.emitted('close')).toBeUndefined();
  });

  it('closes from the cancel button, backdrop and escape', async () => {
    mountDialog();

    await button('common.cancel').trigger('click');
    wrapper!.findComponent(ModalStub).vm.$emit('close');
    wrapper!.findComponent(ModalStub).vm.$emit('escape');

    expect(wrapper!.emitted('close')).toHaveLength(3);
  });
});

describe('closing the editor', () => {
  it('keeps the draft after the dialog is hidden', async () => {
    mountDialog({ modelValue: 'keep=1' });
    await textarea().setValue('edited=2');

    await wrapper!.setProps({ open: false });

    expect(wrapper!.find('[data-testid="modal"]').exists()).toBe(false);
  });
});
