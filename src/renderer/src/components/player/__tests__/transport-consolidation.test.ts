import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards the transport consolidation: the audio bar and the video controls must
// render the one shared TransportButtons, and that component owns the transport
// accessible names (so an ARIA fix lands in one place).

const dir = join(process.cwd(), 'src/renderer/src/components');
const read = (p: string) => readFileSync(join(dir, p), 'utf8');

describe('transport consolidation', () => {
  it('the audio bar and video controls both use the shared TransportButtons', () => {
    expect(read('layout/PlayerBar.vue')).toContain('<TransportButtons');
    expect(read('player/PlayerControls.vue')).toContain('<TransportButtons');
  });

  it('TransportButtons carries the transport accessible names', () => {
    const src = read('player/TransportButtons.vue');
    for (const key of [
      'common.shuffle',
      'common.previous',
      'common.next',
      'common.play',
      'common.pause',
      'common.repeat'
    ]) {
      expect(src, `TransportButtons is missing ${key}`).toContain(key);
    }
  });
});
