import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Component } from 'vue';
import ToolWindowShell from '../ToolWindowShell.vue';

// Szkielet okna narzędzia: wspólny chrom + sloty treści/akcji/stopki i pasek
// statusu, który musi być ogłaszany przez czytnik ekranu.

const global = { mocks: { $t: (key: string) => key } };

function mountShell(props: Record<string, unknown>, slots: Record<string, string> = {}) {
  return mount(ToolWindowShell as Component, { props, slots, global });
}

describe('ToolWindowShell', () => {
  it('renders the title and the content slot', () => {
    const wrapper = mountShell(
      { title: 'Konwerter' },
      { default: '<p data-test="content">treść</p>' }
    );
    expect(wrapper.text()).toContain('Konwerter');
    expect(wrapper.get('[data-test="content"]').isVisible()).toBe(true);
  });

  it('shows the status line as a polite live region', () => {
    const wrapper = mountShell({
      title: 'Konwerter',
      status: { tone: 'error', text: 'Nie udało się zapisać' }
    });
    const status = wrapper.get('[data-testid="tool-window-status"]');
    expect(status.text()).toBe('Nie udało się zapisać');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.classes()).toContain('text-error');
  });

  it('renders the footer only when the slot is used', () => {
    const withoutFooter = mountShell({ title: 'Konwerter' });
    expect(withoutFooter.find('footer').exists()).toBe(false);

    const withFooter = mountShell(
      { title: 'Konwerter' },
      { footer: '<button type="button">Zapisz</button>' }
    );
    expect(withFooter.get('footer').text()).toContain('Zapisz');
  });

  it('places header actions before the window controls', () => {
    const wrapper = mountShell(
      { title: 'Klip' },
      { actions: '<button type="button" data-test="extra">Dodaj</button>' }
    );
    const header = wrapper.get('header');
    expect(header.find('[data-test="extra"]').exists()).toBe(true);
    expect(header.findAll('button').length).toBe(4);
  });
});
