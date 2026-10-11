import { describe, it, expect, vi } from 'vitest';

let beforeRequest:
  | ((
      details: { url: string; resourceType: string; initiator?: string },
      cb: (r: { cancel?: boolean }) => void
    ) => void)
  | null = null;

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => 'C:/tmp-onda-test' },
  session: {
    fromPartition: () => ({
      webRequest: {
        onBeforeRequest: (_filter: unknown, cb: typeof beforeRequest) => {
          beforeRequest = cb;
        }
      }
    })
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
// Cache "świeży" → brak sieci w testach; `||ads.example.com^` trafia do silnika filtrów.
vi.mock('fs/promises', () => ({
  default: {},
  stat: async () => ({ mtimeMs: Date.now() }),
  readFile: async () => '||ads.example.com^\n',
  writeFile: async () => {}
}));

const { installPreviewAdblock, setPreviewAdblock, isPreviewAdblockEnabled } =
  await import('../adblock');

function decide(
  url: string,
  initiator = 'https://page.example',
  type = 'xhr'
): { cancel?: boolean } {
  let result: { cancel?: boolean } = {};
  beforeRequest!({ url, resourceType: type, initiator }, (r) => {
    result = r;
  });
  return result;
}

describe('preview adblock', () => {
  it('blocks built-in ad/tracker requests and allows media', () => {
    installPreviewAdblock();
    setPreviewAdblock(true);
    expect(decide('https://securepubads.g.doubleclick.net/tag/js/gpt.js').cancel).toBe(true);
    expect(decide('https://static.criteo.net/js/ld/publishertag.js').cancel).toBe(true);
    expect(decide('https://cdn.example.com/video/stream.m3u8').cancel).toBeUndefined();
  });

  it('stops blocking when disabled and can be re-enabled', () => {
    installPreviewAdblock();
    setPreviewAdblock(false);
    expect(isPreviewAdblockEnabled()).toBe(false);
    expect(decide('https://doubleclick.net/x').cancel).toBeUndefined();

    setPreviewAdblock(true);
    expect(isPreviewAdblockEnabled()).toBe(true);
    expect(decide('https://doubleclick.net/x').cancel).toBe(true);
  });
});
