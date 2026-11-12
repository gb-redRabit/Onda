import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

import ExplorerPromptDialog from '../ExplorerPromptDialog.vue';

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: ['visible', 'labelledBy', 'panelClass', 'closeOnEscape'],
  emits: ['close', 'escape'],
  template: '<div v-if="visible" data-testid="modal"><slot /></div>'
});

let wrapper: VueWrapper | null = null;

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(ExplorerPromptDialog, {
    props: {
      visible: true,
      isConfirm: false,
      message: 'Name this file',
      value: '',
      ...props
    },
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalStub }
    }
  });
  return wrapper;
}

function button(label: string) {
  return wrapper!.findAll('button').find((item) => item.text() === label)!;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('prompt mode', () => {
  it('renders the message and an input with the current value', () => {
    mountDialog({ message: 'Album title', value: 'Draft' });

    expect(wrapper!.text()).toContain('Album title');
    const input = wrapper!.get('input');
    expect((input.element as HTMLInputElement).value).toBe('Draft');
  });

  it('emits value changes', async () => {
    mountDialog({ value: '' });

    await wrapper!.get('input').setValue('New name');

    expect(wrapper!.emitted('update:value')).toEqual([['New name']]);
  });

  it('confirms on Enter and cancels on Escape', async () => {
    mountDialog();

    await wrapper!.get('input').trigger('keydown', { key: 'Enter' });
    await wrapper!.get('input').trigger('keydown', { key: 'Escape' });

    expect(wrapper!.emitted('confirm')).toHaveLength(1);
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
  });

  it('does not focus the input in confirm mode when reopened', async () => {
    mountDialog({ visible: false, isConfirm: true });
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');

    await wrapper!.setProps({ visible: true });
    await wrapper!.vm.$nextTick();

    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
  });

  it('ignores other keys', async () => {
    mountDialog();

    await wrapper!.get('input').trigger('keydown', { key: 'a' });

    expect(wrapper!.emitted('confirm')).toBeUndefined();
    expect(wrapper!.emitted('cancel')).toBeUndefined();
  });

  it('focuses and selects the input when it opens', async () => {
    mountDialog({ visible: false });
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');

    await wrapper!.setProps({ visible: true });
    await wrapper!.vm.$nextTick();

    expect(document.activeElement).toBe(wrapper!.get('input').element);
    expect(select).toHaveBeenCalled();
    select.mockRestore();
  });
});

describe('confirm mode', () => {
  it('hides the input and renders both actions', async () => {
    mountDialog({ isConfirm: true, message: 'Delete it?' });

    expect(wrapper!.find('input').exists()).toBe(false);
    expect(wrapper!.text()).toContain('Delete it?');

    await button('common.cancel').trigger('click');
    await button('common.ok').trigger('click');

    expect(wrapper!.emitted('cancel')).toHaveLength(1);
    expect(wrapper!.emitted('confirm')).toHaveLength(1);
  });
});

describe('dismissal', () => {
  it('cancels from the shell close and escape events', () => {
    mountDialog();
    const modal = wrapper!.findComponent(ModalStub);

    modal.vm.$emit('close');
    modal.vm.$emit('escape');

    expect(wrapper!.emitted('cancel')).toHaveLength(2);
  });

  it('renders nothing while hidden', () => {
    mountDialog({ visible: false });

    expect(wrapper!.find('[data-testid="modal"]').exists()).toBe(false);
  });
});
