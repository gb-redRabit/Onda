import { describe, expect, it, vi } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import HomeContinueCard from '../HomeContinueCard.vue';
import type { MediaFile } from '@renderer/types/media';

vi.mock('@renderer/components/MediaCover.vue', () => ({
  default: {
    name: 'MediaCover',
    props: ['path', 'size', 'fallback'],
    template: '<div class="media-cover-mock" />'
  }
}));

const mockAudioTrack: MediaFile = {
  id: 'track-1',
  name: 'test-song.mp3',
  path: 'C:/music/test-song.mp3',
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  size: 1024,
  type: 'audio',
  addedAt: 0,
  playCount: 1
};

async function renderCard(track: MediaFile, position: number, locale = 'pl'): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: {
      pl: {
        common: { play: 'Odtwórz' },
        home: {
          continueTitle: 'Kontynuuj',
          resume: 'Wznów',
          playFromStart: 'Odtwórz od nowa'
        }
      },
      en: {
        common: { play: 'Play' },
        home: {
          continueTitle: 'Continue',
          resume: 'Resume',
          playFromStart: 'Play from start'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({
    render: () => h(HomeContinueCard, { track, position })
  });
  app.use(i18n);
  return renderToString(app);
}

describe('HomeContinueCard', () => {
  it('displays "Wznów" and "Odtwórz od nowa" for audio track when position > 5, even with duration = 0', async () => {
    const html = await renderCard(mockAudioTrack, 45, 'pl');
    expect(html).toContain('Wznów');
    expect(html).toContain('Odtwórz od nowa');
    expect(html).toContain('0:45');
  });

  it('displays "Odtwórz" and hides "Odtwórz od nowa" when position <= 5', async () => {
    const html = await renderCard(mockAudioTrack, 3, 'pl');
    expect(html).toContain('Odtwórz');
    expect(html).not.toContain('Wznów');
    expect(html).not.toContain('Odtwórz od nowa');
  });

  it('renders progress bar and total duration when duration is known', async () => {
    const trackWithDuration: MediaFile = {
      ...mockAudioTrack,
      duration: 180
    };
    const html = await renderCard(trackWithDuration, 60, 'pl');
    expect(html).toContain('Wznów');
    expect(html).toContain('Odtwórz od nowa');
    expect(html).toContain('1:00');
    expect(html).toContain('3:00');
    expect(html).toContain('width:33.33333333333333%');
  });

  it('works in English locale with "Resume" and "Play from start"', async () => {
    const html = await renderCard(mockAudioTrack, 50, 'en');
    expect(html).toContain('Resume');
    expect(html).toContain('Play from start');
  });
});
