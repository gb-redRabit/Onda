import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import EmptyState from '../ui/EmptyState.vue';
import Badge from '../ui/Badge.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import FieldLabel from '../sources/FieldLabel.vue';
import DownloadPreviewCard from '../online/DownloadPreviewCard.vue';
import WizardStep from '../wizard/WizardStep.vue';

vi.mock('@lucide/vue', () => ({
  Image: defineComponent({
    props: { size: Number },
    setup: () => () => h('svg', { 'data-image': '' })
  })
}));

const Icon = defineComponent({
  props: { size: Number },
  setup: (props) => () => h('i', { 'data-icon': '', 'data-size': props.size })
});

describe('EmptyState', () => {
  it('renders the default panel without optional content', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Nothing here', icon: Icon } });

    expect(wrapper.get('[role="status"]').classes()).toEqual(
      expect.arrayContaining(['gap-3', 'p-10'])
    );
    expect(wrapper.text()).toContain('Nothing here');
    expect(wrapper.get('[data-icon]').attributes('data-size')).toBe('40');
    expect(wrapper.findAll('p')).toHaveLength(1);
  });

  it('renders a compact panel with description, icon and slot', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Empty', description: 'Try again', icon: Icon, compact: true },
      slots: { default: '<button>Retry</button>' }
    });

    expect(wrapper.get('[role="status"]').classes()).toEqual(
      expect.arrayContaining(['gap-2', 'p-6'])
    );
    expect(wrapper.get('[data-icon]').attributes('data-size')).toBe('28');
    expect(wrapper.text()).toContain('Try again');
    expect(wrapper.find('button').text()).toBe('Retry');
  });

  it('renders the plain variant with the larger icon', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Plain', description: 'Desc', icon: Icon, variant: 'plain' }
    });

    const root = wrapper.get('[role="status"]');
    expect(root.classes()).toContain('py-16');
    expect(root.classes()).not.toContain('border-dashed');
    expect(wrapper.get('[data-icon]').attributes('data-size')).toBe('64');
  });
});

describe('Badge', () => {
  it('applies the small neutral defaults', () => {
    const wrapper = mount(Badge, { slots: { default: 'New' } });

    expect(wrapper.text()).toBe('New');
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['px-1.5', 'py-0.5', 'text-3xs', 'bg-base-300/80'])
    );
  });

  it('applies the medium error tone', () => {
    const wrapper = mount(Badge, { props: { tone: 'error', size: 'md' } });

    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['px-2', 'py-1', 'text-2xs', 'bg-error/15'])
    );
  });
});

describe('SegmentedControl', () => {
  it('renders options with icons, test ids and pressed state', () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'grid',
        label: 'View',
        testIdPrefix: 'view',
        options: [
          { value: 'list', label: 'List' },
          { value: 'grid', label: 'Grid', icon: Icon }
        ]
      }
    });

    const group = wrapper.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('View');

    const buttons = wrapper.findAll('button');
    expect(buttons[0].attributes('aria-pressed')).toBe('false');
    expect(buttons[0].attributes('data-testid')).toBe('view-list');
    expect(buttons[1].attributes('aria-pressed')).toBe('true');
    expect(buttons[1].find('[data-icon]').exists()).toBe(true);
    expect(buttons[0].find('[data-icon]').exists()).toBe(false);
  });

  it('updates the model on click and omits the test id without a prefix', async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'list',
        options: [{ value: 'grid', label: 'Grid' }]
      }
    });

    const button = wrapper.get('button');
    expect(button.attributes('data-testid')).toBeUndefined();
    await button.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['grid']);
  });
});

describe('FieldLabel', () => {
  it('uses uppercase and normal spacing by default', () => {
    const wrapper = mount(FieldLabel, { props: { text: 'Name', htmlFor: 'name' } });

    expect(wrapper.get('label').attributes('for')).toBe('name');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['uppercase', 'mb-1']));
  });

  it('supports tight spacing without uppercase', () => {
    const wrapper = mount(FieldLabel, { props: { text: 'Name', tight: true, upper: false } });

    expect(wrapper.classes()).toContain('mb-0.5');
    expect(wrapper.classes()).not.toContain('uppercase');
  });
});

describe('DownloadPreviewCard', () => {
  it('shows the thumbnail when present', () => {
    const wrapper = mount(DownloadPreviewCard, {
      props: { thumbnail: 'https://img/x.jpg', title: 'Cover' }
    });

    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe('https://img/x.jpg');
    expect(img.attributes('alt')).toBe('Cover');
  });

  it('shows a placeholder without a thumbnail', () => {
    const wrapper = mount(DownloadPreviewCard, { props: { title: 'Cover' } });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('[data-image]').exists()).toBe(true);
  });
});

describe('WizardStep', () => {
  it('renders a description with extra spacing when requested', () => {
    const wrapper = mount(WizardStep, {
      props: { title: 'Step', description: 'Details', descriptionGap: true },
      slots: { default: '<p>Body</p>' }
    });

    expect(wrapper.get('h3').text()).toBe('Step');
    expect(wrapper.get('p').classes()).toContain('mb-5');
    expect(wrapper.text()).toContain('Body');
  });

  it('renders only the title without a description', () => {
    const wrapper = mount(WizardStep, { props: { title: 'Only title' } });

    expect(wrapper.findAll('p')).toHaveLength(0);
  });

  it('omits the gap class by default', () => {
    const wrapper = mount(WizardStep, { props: { title: 'Step', description: 'Details' } });

    expect(wrapper.get('p').classes()).not.toContain('mb-5');
  });
});
