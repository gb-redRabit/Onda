import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import PageHeader from '../PageHeader.vue';

const Icon = defineComponent({ name: 'PageIcon', template: '<i data-testid="page-icon" />' });

function mountHeader(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(PageHeader, {
    props: { title: 'Page', ...props },
    slots: {
      actions: '<button data-testid="action">A</button>',
      default: '<div data-testid="content">Body</div>',
      overlay: '<div data-testid="overlay">O</div>',
      ...slots
    }
  });
}

describe('PageHeader', () => {
  it('renders the title, subtitle and icon', () => {
    const wrapper = mountHeader({ subtitle: 'Subtitle', icon: Icon });

    expect(wrapper.get('h1').text()).toBe('Page');
    expect(wrapper.get('p').text()).toBe('Subtitle');
    expect(wrapper.find('[data-testid="page-icon"]').exists()).toBe(true);
  });

  it('omits optional subtitle and icon', () => {
    const wrapper = mountHeader();

    expect(wrapper.find('p').exists()).toBe(false);
    expect(wrapper.find('[data-testid="page-icon"]').exists()).toBe(false);
  });

  it('renders all slots', () => {
    const wrapper = mountHeader();

    expect(wrapper.find('[data-testid="action"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overlay"]').exists()).toBe(true);
  });

  it('applies default layout classes', () => {
    const header = mountHeader().get('header');

    expect(header.classes()).toContain('px-5');
    expect(header.classes()).toContain('py-3');
    expect(header.classes()).toContain('border-hairline/80');
    expect(header.classes()).not.toContain('sticky');
  });

  it('applies sticky, compact and elevated modifiers', () => {
    const header = mountHeader({ sticky: true, compact: true, elevated: true }).get('header');

    expect(header.classes()).toContain('sticky');
    expect(header.classes()).toContain('top-0');
    expect(header.classes()).toContain('px-4');
    expect(header.classes()).toContain('py-2.5');
    expect(header.classes()).toContain('shadow-md');
    expect(header.classes()).toContain('border-transparent');
  });

  it('omits the default slot wrapper without content', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Page' },
      slots: { actions: '<button>A</button>' }
    });

    expect(wrapper.findAll('.mt-3')).toHaveLength(0);
  });
});
