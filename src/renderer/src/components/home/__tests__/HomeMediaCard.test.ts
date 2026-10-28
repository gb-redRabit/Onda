import { describe, expect, it, vi } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import HomeMediaCard from '../HomeMediaCard.vue';

vi.mock('@renderer/components/MediaCover.vue', () => ({
  default: {
    name: 'MediaCover',
    props: ['path', 'size', 'fallback'],
    template: '<div class="media-cover-mock" />'
  }
}));

interface CardProps {
  title: string;
  subtitle?: string;
  coverPath?: string;
  round?: boolean;
  coverSize?: number;
  fallback?: 'music' | 'play' | 'disc' | 'film';
  openLabel?: string;
  badge?: string;
  stacked?: boolean;
}

function render(props: CardProps): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'pl',
    messages: { pl: { common: { play: 'Odtwórz' } } },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(HomeMediaCard, props) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

describe('HomeMediaCard', () => {
  it('renders the play-count badge when one is provided', async () => {
    const html = await render({ title: 'Song', badge: '14×' });
    expect(html).toContain('14×');
  });

  it('adds the stacked layers for collections', async () => {
    const html = await render({ title: 'Album', stacked: true });
    expect(html).toContain('inset-x-3');
    expect(html).toContain('inset-x-1.5');
  });

  it('never stacks round avatars and marks them as circles', async () => {
    const html = await render({ title: 'Artist', round: true, stacked: true });
    expect(html).not.toContain('inset-x-3');
    expect(html).toContain('rounded-full');
  });

  it('keeps a labelled play control inside every card', async () => {
    const html = await render({ title: 'Song' });
    expect(html).toContain('aria-label="Odtwórz"');
  });
});
