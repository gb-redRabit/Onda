import { describe, expect, it } from 'vitest';
import { parseLrc } from '../lrc';

describe('parseLrc', () => {
  it('parses timestamps, metadata and multiple tags per line', () => {
    const result = parseLrc(
      [
        '[ar:Artist]',
        '[ti:Title]',
        '[00:12.34]First line',
        '[00:20.00][00:30.500]Repeated line',
        '[01:02]Last line'
      ].join('\n')
    );

    expect(result.kind).toBe('synced');
    expect(result.lines).toEqual([
      { timeMs: 12340, text: 'First line' },
      { timeMs: 20000, text: 'Repeated line' },
      { timeMs: 30500, text: 'Repeated line' },
      { timeMs: 62000, text: 'Last line' }
    ]);
  });

  it('returns plain lines when there are no timestamps', () => {
    expect(parseLrc('Line one\n\nLine two')).toEqual({
      kind: 'plain',
      lines: [
        { timeMs: 0, text: 'Line one' },
        { timeMs: 0, text: 'Line two' }
      ]
    });
  });

  it('exposes the LRC offset header', () => {
    const result = parseLrc('[offset:-250]\n[00:01.00]Hi');
    expect(result.offsetMs).toBe(-250);
    expect(result.lines[0]).toEqual({ timeMs: 1000, text: 'Hi' });
  });

  it('sorts and deduplicates identical timestamp/text pairs', () => {
    const result = parseLrc('[00:05.00]B\n[00:01.00]A\n[00:05.00]B');
    expect(result.lines).toEqual([
      { timeMs: 1000, text: 'A' },
      { timeMs: 5000, text: 'B' }
    ]);
  });

  it('ignores a UTF-8 BOM before the first tag', () => {
    const result = parseLrc('\uFEFF[00:01.00]Hello');
    expect(result.kind).toBe('synced');
    expect(result.lines[0]).toEqual({ timeMs: 1000, text: 'Hello' });
  });

  it('returns none for empty input', () => {
    expect(parseLrc('')).toEqual({ kind: 'none', lines: [] });
    expect(parseLrc('[ar:Only metadata]')).toEqual({ kind: 'none', lines: [] });
  });
});
