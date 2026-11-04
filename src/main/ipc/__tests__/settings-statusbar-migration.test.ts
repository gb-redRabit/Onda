import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../settings/settings-schema';

describe('status bar sections migration', () => {
  it('adds the view-context section when only viewCounts was enabled', () => {
    const { sanitized } = sanitizeSettings({
      statusBar: { visible: true, sections: ['playing', 'viewCounts'] }
    });
    expect(sanitized.statusBar?.sections).toEqual(['playing', 'viewCounts', 'context']);
  });

  it('does not add context when counts were disabled', () => {
    const { sanitized } = sanitizeSettings({
      statusBar: { visible: true, sections: ['playing', 'clock'] }
    });
    expect(sanitized.statusBar?.sections).toEqual(['playing', 'clock']);
  });
});
