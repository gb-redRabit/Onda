import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ResumePrompt from '../ResumePrompt.vue';

function mountPrompt(position = 65) {
  return mount(ResumePrompt, {
    props: { position },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('ResumePrompt', () => {
  it('shows the saved position', () => {
    const text = mountPrompt(65).text();

    expect(text).toContain('resume.title');
    expect(text).toContain('1:05');
    expect(text).toContain('resume.question');
    expect(text).toContain('resume.continue');
    expect(text).toContain('resume.fromStart');
  });

  it('emits continue and start', async () => {
    const wrapper = mountPrompt();
    const buttons = wrapper.findAll('button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('continue')).toEqual([[]]);
    expect(wrapper.emitted('start')).toEqual([[]]);
  });

  it('pauses the countdown on hover and focus', async () => {
    const wrapper = mountPrompt();
    const root = wrapper.get('div');

    await root.trigger('mouseenter');
    await root.trigger('focusin');

    expect(wrapper.emitted('pause')).toHaveLength(2);
  });

  it('resumes the countdown on leave and blur', async () => {
    const wrapper = mountPrompt();
    const root = wrapper.get('div');

    await root.trigger('mouseleave');
    await root.trigger('focusout');

    expect(wrapper.emitted('resume')).toHaveLength(2);
  });
});
