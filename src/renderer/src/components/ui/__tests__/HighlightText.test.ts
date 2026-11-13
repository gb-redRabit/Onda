import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import HighlightText from '../HighlightText.vue';

describe('HighlightText', () => {
  it('renders plain text without a query', () => {
    const wrapper = mount(HighlightText, { props: { text: 'Hello world' } });

    expect(wrapper.text()).toBe('Hello world');
    expect(wrapper.find('mark').exists()).toBe(false);
  });

  it('renders empty text safely', () => {
    const wrapper = mount(HighlightText, { props: { text: '', query: 'x' } });

    expect(wrapper.text()).toBe('');
  });

  it('marks the matching fragment', () => {
    const wrapper = mount(HighlightText, { props: { text: 'Hello world', query: 'world' } });

    expect(wrapper.get('mark').text()).toBe('world');
    expect(wrapper.text()).toBe('Hello world');
    expect(wrapper.get('mark').classes()).toContain('bg-primary/20');
  });

  it('marks every occurrence', () => {
    const wrapper = mount(HighlightText, { props: { text: 'ab ab ab', query: 'ab' } });

    expect(wrapper.findAll('mark')).toHaveLength(3);
  });

  it('renders text literally (no html injection)', () => {
    const wrapper = mount(HighlightText, {
      props: { text: '<img src=x onerror=alert(1)>', query: 'img' }
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img');
  });
});
