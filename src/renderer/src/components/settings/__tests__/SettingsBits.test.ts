import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import SettingsGroup from '../SettingsGroup.vue';
import SettingsSectionTitle from '../SettingsSectionTitle.vue';
import OnlineChannelError from '../../online/OnlineChannelError.vue';

describe('SettingsGroup', () => {
  it('renders the title, description and slot', () => {
    const wrapper = mount(SettingsGroup, {
      props: { title: 'Group', description: 'Details', id: 'group-1' },
      slots: { default: '<p data-testid="row">Row</p>' }
    });

    expect(wrapper.attributes('id')).toBe('group-1');
    expect(wrapper.get('h3').text()).toBe('Group');
    expect(wrapper.text()).toContain('Details');
    expect(wrapper.find('[data-testid="row"]').exists()).toBe(true);
  });

  it('omits optional title and description', () => {
    const wrapper = mount(SettingsGroup);

    expect(wrapper.find('h3').exists()).toBe(false);
    expect(wrapper.find('p').exists()).toBe(false);
  });
});

describe('SettingsSectionTitle', () => {
  it('renders the title and optional description', () => {
    const wrapper = mount(SettingsSectionTitle, {
      props: { title: 'Section', description: 'About' }
    });

    expect(wrapper.get('h3').text()).toBe('Section');
    expect(wrapper.get('p').text()).toBe('About');
  });

  it('omits the description when absent', () => {
    expect(
      mount(SettingsSectionTitle, { props: { title: 'Section' } })
        .find('p')
        .exists()
    ).toBe(false);
  });
});

describe('OnlineChannelError', () => {
  it('shows the message and retries', async () => {
    const wrapper = mount(OnlineChannelError, {
      props: { message: 'Channel failed' },
      global: { mocks: { $t: (key: string) => key } }
    });

    expect(wrapper.text()).toContain('Channel failed');
    expect(wrapper.text()).toContain('youtube.search');

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toEqual([[]]);
  });
});
