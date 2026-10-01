import { describe, expect, it, vi } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import PipTransport from '../PipTransport.vue';

// Trzy układy PiP miały własne kopie przycisków transportu, a
// kopie się rozjechały: tylko układ karty rysował plakietkę "1" dla
// powtarzania jednego. Te testy utrwalają zachowanie współdzielonego komponentu, żeby plakietka
// i stany aktywne nie mogły znowu zniknąć z żadnego układu.

interface TransportProps {
  send: (action: string) => void;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: string;
  layout?: 'horizontal' | 'vertical';
  btnClass?: string;
  playBtnClass?: string;
}

function render(props: TransportProps) {
  return renderToString(createSSRApp({ render: () => h(PipTransport, props) }));
}

const send = vi.fn();

const GLYPHS = ['⇄', '⏮', '▶', '⏸', '⏭', '↻'];

/** Glify przycisków w kolejności dokumentu. */
function glyphOrder(html: string): string[] {
  const body = html.slice(html.indexOf('<button'));
  return GLYPHS.filter((g) => body.indexOf(g) !== -1).sort(
    (a, b) => body.indexOf(a) - body.indexOf(b)
  );
}

describe('PipTransport', () => {
  it('renders all five transport buttons', async () => {
    const html = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });
    expect(html.match(/<button/g)).toHaveLength(5);
  });

  it('renders the horizontal order shuffle, prev, play, next, repeat', async () => {
    const html = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });
    // SSR nie serializuje handlerów zdarzeń, więc kolejność przycisków jest sprawdzana
    // przez glify. Każda akcja ma odrębny glif, co czyni
    // kolejność obserwowalną w wyrenderowanym wyniku.
    expect(glyphOrder(html)).toEqual(['⇄', '⏮', '▶', '⏭', '↻']);
  });

  it('puts play/pause first in a vertical layout', async () => {
    const html = await render({
      send,
      isPlaying: false,
      shuffle: false,
      repeat: 'none',
      layout: 'vertical'
    });
    expect(glyphOrder(html)).toEqual(['▶', '⏮', '⏭', '⇄', '↻']);
  });

  it('shows the pause glyph only while playing', async () => {
    const paused = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });
    const playing = await render({ send, isPlaying: true, shuffle: false, repeat: 'none' });
    expect(paused).toContain('▶');
    expect(paused).not.toContain('⏸');
    expect(playing).toContain('⏸');
    expect(playing).not.toContain('▶');
  });

  it('badges repeat-one and badges nothing else', async () => {
    const one = await render({ send, isPlaying: false, shuffle: false, repeat: 'one' });
    const all = await render({ send, isPlaying: false, shuffle: false, repeat: 'all' });
    const off = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });

    expect(one).toContain('>1<');
    expect(all).not.toContain('>1<');
    expect(off).not.toContain('>1<');
  });

  it('marks shuffle and repeat active from state, not from a separate prop', async () => {
    const off = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });
    const on = await render({ send, isPlaying: true, shuffle: true, repeat: 'all' });

    // BTN_ACTIVE to nadpisanie kolorem primary; musi pojawić się dokładnie dla
    // tasowania i powtarzania, gdy są włączone.
    const activeCount = (html: string) => (html.match(/color-primary\)\]!/g) ?? []).length;
    expect(activeCount(off)).toBe(0);
    expect(activeCount(on)).toBe(2);
  });

  it('uses the button classes it is given, edge classes by default', async () => {
    const edge = await render({ send, isPlaying: false, shuffle: false, repeat: 'none' });
    const custom = await render({
      send,
      isPlaying: false,
      shuffle: false,
      repeat: 'none',
      btnClass: 'my-btn',
      playBtnClass: 'my-play'
    });
    expect(edge).toContain('h-7');
    expect(edge).not.toContain('my-btn');
    expect(custom).toContain('my-btn');
    expect(custom).toContain('my-play');
    expect(custom).not.toContain('h-7');
  });
});
