import { describe, expect, it, vi } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import AudioControlsCore from '../AudioControlsCore.vue';

// Renders each layout so the density map is exercised for real rather than only
// asserted structurally: a typo in a class name or a missing token would still
// produce markup, but a wrong `d.volumeRow` reference would not resolve at all.

vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    isPlaying: { value: false },
    play: vi.fn(),
    pause: vi.fn(),
    setVolume: vi.fn()
  })
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({
    shuffle: false,
    repeat: 'none',
    isMuted: false,
    volume: 0.5,
    equalizerVisible: false,
    queueVisible: false,
    isFavorite: () => false,
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
    prevTrack: vi.fn(),
    nextTrack: vi.fn(),
    toggleMute: vi.fn(),
    toggleEqualizer: vi.fn(),
    toggleQueue: vi.fn()
  })
}));

type CoreProps = {
  variant: 'wide' | 'tall' | 'compact' | 'minimal';
  compact: boolean;
  widthSufficient: boolean;
  volumeFit: boolean;
};

async function render(props: CoreProps): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: { common: {}, player: {} } },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(AudioControlsCore, props) });
  app.use(i18n);
  return renderToString(app);
}

describe('AudioControlsCore renders each layout', () => {
  it('names every transport control in every layout', async () => {
    for (const variant of ['wide', 'tall', 'compact', 'minimal'] as const) {
      const html = await render({
        variant,
        compact: false,
        widthSufficient: true,
        volumeFit: true
      });
      for (const name of ['common.shuffle', 'common.previous', 'common.next']) {
        expect(html, `${variant} is missing ${name}`).toContain(name);
      }
      // Not playing, so the play button's name is common.play, not common.pause.
      expect(html, variant).toContain('common.play');
      expect(html, variant).toContain('player.repeatNone');
    }
  });

  it('names the volume controls in every layout', async () => {
    // minimal shows the volume row only when the transport was gated away, so
    // this configuration is the one where all four have one.
    for (const variant of ['wide', 'tall', 'compact', 'minimal'] as const) {
      const html = await render({
        variant,
        compact: false,
        widthSufficient: false,
        volumeFit: true
      });
      expect(html, `${variant} is missing mute`).toContain('common.mute');
      expect(html, `${variant} is missing the volume slider`).toContain('player.volumeSlider');
    }
  });

  it('drops the extras row for minimal', async () => {
    const html = await render({
      variant: 'minimal',
      compact: false,
      widthSufficient: true,
      volumeFit: true
    });
    expect(html).not.toContain('common.equalizer');
    expect(html).not.toContain('common.queue');
  });

  it('keeps the extras row for the other layouts', async () => {
    for (const variant of ['wide', 'tall', 'compact'] as const) {
      const html = await render({
        variant,
        compact: false,
        widthSufficient: true,
        volumeFit: true
      });
      expect(html, variant).toContain('common.equalizer');
      expect(html, variant).toContain('common.queue');
    }
  });

  it('falls back to a play-only button when minimal has no width', async () => {
    const html = await render({
      variant: 'minimal',
      compact: false,
      widthSufficient: false,
      volumeFit: true
    });
    // Transport gated away — shuffle/prev/next must be gone, play must remain.
    expect(html).not.toContain('common.shuffle');
    expect(html).not.toContain('common.previous');
    expect(html).toContain('common.play');
    // ...and the volume row appears, because minimal shows it in that case.
    expect(html).toContain('player.volumeSlider');
  });

  it('hides every optional row when compact', async () => {
    for (const variant of ['wide', 'tall', 'compact'] as const) {
      const html = await render({
        variant,
        compact: true,
        widthSufficient: true,
        volumeFit: true
      });
      expect(html, variant).not.toContain('common.mute');
      expect(html, variant).not.toContain('common.equalizer');
      expect(html, variant).toContain('common.shuffle');
    }
  });

  it('marks the volume bar as a slider with its current value', async () => {
    const html = await render({
      variant: 'wide',
      compact: false,
      widthSufficient: true,
      volumeFit: true
    });
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });
});
