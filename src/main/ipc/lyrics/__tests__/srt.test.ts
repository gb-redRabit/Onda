import { describe, expect, it } from 'vitest';
import { parseSrt } from '../srt';

describe('parseSrt', () => {
  it('parses cues, strips markup and keeps multi-line text', () => {
    const result = parseSrt(
      [
        '1',
        '00:00:01,500 --> 00:00:03,000',
        'Hello <i>world</i>',
        '',
        '2',
        '00:00:03.000 --> 00:00:05.000',
        '{\\an8}Second',
        'line'
      ].join('\n')
    );

    expect(result.kind).toBe('synced');
    expect(result.lines).toEqual([
      { timeMs: 1500, text: 'Hello world' },
      { timeMs: 3000, text: 'Second\nline' }
    ]);
  });

  it('handles BOM and missing blank lines', () => {
    const result = parseSrt('\uFEFF1\n00:00:00,000 --> 00:00:01,000\nOne');
    expect(result.lines).toEqual([{ timeMs: 0, text: 'One' }]);
  });

  it('returns none when there are no valid cues', () => {
    expect(parseSrt('not a subtitle file')).toEqual({ kind: 'none', lines: [] });
    expect(parseSrt('')).toEqual({ kind: 'none', lines: [] });
  });

  it('skips malformed timings and empty cue text', () => {
    const result = parseSrt(
      [
        '1',
        '00:00 --> 00:01',
        'No timing',
        '',
        '2',
        '00:00:02,000 --> 00:00:03,000',
        '<i></i>',
        '',
        '3',
        '00:00:04,000 --> 00:00:05,000',
        '&nbsp;'
      ].join('\n')
    );

    expect(result).toEqual({ kind: 'none', lines: [] });
  });

  it('drops duplicate cues after sorting', () => {
    const result = parseSrt(
      [
        '1',
        '00:00:02,000 --> 00:00:03,000',
        'Same',
        '',
        '2',
        '00:00:01,000 --> 00:00:02,000',
        'First',
        '',
        '3',
        '00:00:02,000 --> 00:00:03,000',
        'Same'
      ].join('\n')
    );

    expect(result.lines).toEqual([
      { timeMs: 1000, text: 'First' },
      { timeMs: 2000, text: 'Same' }
    ]);
  });
});
