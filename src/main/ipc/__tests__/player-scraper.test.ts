import { describe, expect, it } from 'vitest';
import { extractMediaUrls } from '../player-scraper';

describe('extractMediaUrls', () => {
  it('finds m3u8 in a "sources" JSON block (bigwarp/luluvdo style)', () => {
    const html = `
      <script>
        var player = new Playerjs({ file: "https://cdn.example.com/hls/abc123/index.m3u8" });
        var sources = [{ file: "https://cdn.example.com/hls/abc123/index.m3u8" }];
      </script>`;
    expect(extractMediaUrls(html).hls).toContain('https://cdn.example.com/hls/abc123/index.m3u8');
  });

  it('finds escaped \\/ URLs (uqload/filemoon inline JSON style)', () => {
    const html = `sources: [{"file": "https:\\/\\/cdn.uqload.xyz\\/v\\/abc.m3u8"}]`;
    expect(extractMediaUrls(html).hls).toContain('https://cdn.uqload.xyz/v/abc.m3u8');
  });

  it('finds a bare m3u8 URL in an inline script', () => {
    const html = `const src = "https://stream.site/hls/playlist.m3u8?token=abc";`;
    expect(extractMediaUrls(html).hls).toContain('https://stream.site/hls/playlist.m3u8?token=abc');
  });

  it('finds direct mp4 files', () => {
    const html = `<video src="https://cdn.site/video/file.mp4"></video>`;
    const r = extractMediaUrls(html);
    expect(r.direct).toContain('https://cdn.site/video/file.mp4');
    expect(r.hls).toHaveLength(0);
  });

  it('prefers nothing when the page has no media URLs', () => {
    const r = extractMediaUrls('<html><body>nothing here</body></html>');
    expect(r.hls).toHaveLength(0);
    expect(r.direct).toHaveLength(0);
  });

  it('does not list the same URL twice', () => {
    const html = `file: "https://cdn.site/a.m3u8" file: "https://cdn.site/a.m3u8"`;
    expect(extractMediaUrls(html).hls).toEqual(['https://cdn.site/a.m3u8']);
  });

  it('ignores relative URLs', () => {
    const html = `file: "/media/playlist.m3u8"`;
    expect(extractMediaUrls(html).hls).toHaveLength(0);
  });
});