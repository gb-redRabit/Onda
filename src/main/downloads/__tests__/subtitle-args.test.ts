import { describe, it, expect } from 'vitest';
import { buildSubtitleArgs } from '../subtitle-args';

describe('buildSubtitleArgs', () => {
  it('writes manual subtitles only in manual mode', () => {
    const args = buildSubtitleArgs({ langs: 'pl,en', mode: 'manual', kind: 'video', embed: true });
    expect(args).toContain('--write-subs');
    expect(args).not.toContain('--write-auto-subs');
  });

  it('writes automatic subtitles only in auto mode', () => {
    const args = buildSubtitleArgs({ langs: 'pl', mode: 'auto', kind: 'audio', embed: false });
    expect(args).toContain('--write-auto-subs');
    expect(args).not.toContain('--write-subs');
  });

  it('writes both in best mode (default)', () => {
    const args = buildSubtitleArgs({ langs: 'pl', kind: 'video', embed: false });
    expect(args).toContain('--write-subs');
    expect(args).toContain('--write-auto-subs');
  });

  it('defaults to srt and respects a custom format', () => {
    const srt = buildSubtitleArgs({ langs: 'pl', kind: 'video', embed: false });
    expect(srt.slice(srt.indexOf('--convert-subs'))[1]).toBe('srt');
    const vtt = buildSubtitleArgs({ langs: 'pl', format: 'vtt', kind: 'video', embed: false });
    expect(vtt.slice(vtt.indexOf('--convert-subs'))[1]).toBe('vtt');
    const ass = buildSubtitleArgs({ langs: 'pl', format: 'ass', kind: 'video', embed: false });
    expect(ass.slice(ass.indexOf('--convert-subs'))[1]).toBe('ass');
  });

  it('embeds subtitles only when requested', () => {
    const embedded = buildSubtitleArgs({ langs: 'pl', kind: 'video', embed: true });
    expect(embedded).toContain('--embed-subs');
    const sidecar = buildSubtitleArgs({ langs: 'pl', kind: 'audio', embed: false });
    expect(sidecar).not.toContain('--embed-subs');
  });

  it('always marks subtitles as non-critical', () => {
    const args = buildSubtitleArgs({ langs: 'pl', kind: 'video', embed: true });
    expect(args).toContain('--ignore-errors');
  });
});
