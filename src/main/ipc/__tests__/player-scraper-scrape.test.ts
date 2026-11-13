import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  httpRequest: vi.fn(),
  resolveNetworkTarget: vi.fn(),
  privateNetworkAllowedForTarget: vi.fn()
}));

vi.mock('../http-request', () => ({ httpRequest: h.httpRequest }));
vi.mock('../network-target', () => ({
  resolveNetworkTarget: h.resolveNetworkTarget,
  privateNetworkAllowedForTarget: h.privateNetworkAllowedForTarget
}));

import { scrapePlayerUrl } from '../player-scraper';

const HLS = 'https://cdn.example.com/hls/index.m3u8';

beforeEach(() => {
  h.httpRequest.mockReset().mockResolvedValue({ text: `<script>file: "${HLS}"</script>` });
  h.resolveNetworkTarget.mockReset().mockResolvedValue({});
  h.privateNetworkAllowedForTarget.mockReset().mockReturnValue(false);
});

describe('scrapePlayerUrl', () => {
  it('rejects non-https embed urls', async () => {
    await expect(scrapePlayerUrl('http://insecure.test/page', {})).resolves.toBeNull();
    expect(h.httpRequest).not.toHaveBeenCalled();
  });

  it('returns the first HLS stream with the embed as referer', async () => {
    const result = await scrapePlayerUrl('https://embed.test/player', { 'X-Token': 't' });

    expect(result).toEqual({ url: HLS, kind: 'hls', referer: 'https://embed.test/player' });
    expect(h.httpRequest).toHaveBeenCalledWith(
      'https://embed.test/player',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Token': 't' },
        maxRedirects: 5,
        timeoutMs: 15_000,
        maxBytes: 2 * 1024 * 1024
      })
    );
    expect(h.resolveNetworkTarget).toHaveBeenCalledWith(HLS, { allowPrivateNetwork: false });

    const options = h.httpRequest.mock.calls[0][1] as {
      defaultHeaders: (url: string) => Record<string, string>;
    };
    expect(options.defaultHeaders('https://embed.test/page')).toEqual(
      expect.objectContaining({
        Accept: expect.stringContaining('text/html'),
        Referer: 'https://embed.test/page'
      })
    );
  });

  it('validates private-network access from the same origin', async () => {
    h.privateNetworkAllowedForTarget.mockReturnValue(true);

    await scrapePlayerUrl('https://embed.test/player', {}, true);

    expect(h.privateNetworkAllowedForTarget).toHaveBeenCalledWith(HLS, 'https://embed.test', true);
    expect(h.resolveNetworkTarget).toHaveBeenCalledWith(HLS, { allowPrivateNetwork: true });
  });

  it('falls back to a direct video url', async () => {
    h.httpRequest.mockResolvedValue({
      text: '<video src="https://cdn.test/v.mp4" />'
    });

    const result = await scrapePlayerUrl('https://embed.test/player', {});

    expect(result).toEqual({
      url: 'https://cdn.test/v.mp4',
      kind: 'direct',
      referer: 'https://embed.test/player'
    });
  });

  it('returns null without media urls', async () => {
    h.httpRequest.mockResolvedValue({ text: '<html>nothing</html>' });

    await expect(scrapePlayerUrl('https://embed.test/player', {})).resolves.toBeNull();
    expect(h.resolveNetworkTarget).not.toHaveBeenCalled();
  });

  it('returns null when fetching fails', async () => {
    h.httpRequest.mockRejectedValue(new Error('network'));

    await expect(scrapePlayerUrl('https://embed.test/player', {})).resolves.toBeNull();
  });

  it('returns null when the extracted url is rejected', async () => {
    h.resolveNetworkTarget.mockRejectedValue(new Error('blocked'));

    await expect(scrapePlayerUrl('https://embed.test/player', {})).resolves.toBeNull();
  });
});
