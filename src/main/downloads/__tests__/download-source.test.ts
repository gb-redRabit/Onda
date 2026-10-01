import { describe, expect, it } from 'vitest';
import { buildJobSource } from '../download-source';

// Regression: the queue dropped `sourceId`, `sourceItemId` and
// `allowPrivateNetwork` when rebuilding a job's source, so a finished source
// download was never recorded as "downloaded" and private-network trust was lost.

describe('buildJobSource', () => {
  it('returns undefined when there is no source', () => {
    expect(buildJobSource(undefined)).toBeUndefined();
  });

  it('keeps the source identity and item id for an http download', () => {
    const source = buildJobSource({
      mode: 'http',
      sourceId: 'src-1',
      sourceItemId: 'item-42',
      allowPrivateNetwork: true,
      fileName: 'a.mp4'
    });
    expect(source).toMatchObject({
      mode: 'http',
      sourceId: 'src-1',
      sourceItemId: 'item-42',
      allowPrivateNetwork: true,
      fileName: 'a.mp4'
    });
  });

  it('keeps source identity for ytdlp and soundcloud modes', () => {
    expect(buildJobSource({ mode: 'ytdlp', sourceId: 's', sourceItemId: 'i' })).toMatchObject({
      mode: 'ytdlp',
      sourceId: 's',
      sourceItemId: 'i'
    });
    expect(buildJobSource({ mode: 'soundcloud', sourceId: 's', sourceItemId: 'i' })).toMatchObject({
      mode: 'soundcloud',
      sourceId: 's',
      sourceItemId: 'i'
    });
  });

  it('bounds oversized identifiers', () => {
    const source = buildJobSource({
      mode: 'ytdlp',
      sourceId: 'x'.repeat(500),
      sourceItemId: 'y'.repeat(1000)
    });
    expect(source?.sourceId).toHaveLength(200);
    expect(source?.sourceItemId).toHaveLength(500);
  });
});
