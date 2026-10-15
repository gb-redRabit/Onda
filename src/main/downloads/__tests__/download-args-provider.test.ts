import { describe, it, expect } from 'vitest';
import { buildBaseArgs } from '../download-args';
import type { Job } from '../download-helpers';

// Regresja: tryb providera używa syntetycznego URL-a (`provider://…`), więc
// `buildBaseArgs` MUSI go pominąć — inaczej walidacja http rzucała
// „Invalid download URL: rejected non-http(s) scheme" i pobieranie z PikPak/MEGA/Drive padało.

describe('buildBaseArgs — provider mode', () => {
  it('returns no yt-dlp args for a provider job', async () => {
    const job = {
      url: 'provider://pikpak/SHARE1/f1',
      source: { mode: 'provider', providerId: 'pikpak' }
    } as unknown as Job;
    await expect(buildBaseArgs(job)).resolves.toEqual([]);
  });
});
