import { describe, it, expect } from 'vitest';
import {
  hashContent,
  extractAssFamilies,
  hexToAssColor,
  htmlToAssTags,
  convertToAss
} from '../subtitleConvert';

const ASS_HEADER =
  '[Script Info]\nTitle: Subtitles\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

describe('hashContent', () => {
  it('returns stable hash for the same input', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });

  it('produces different hashes for different input', () => {
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });
});

describe('extractAssFamilies', () => {
  it('extracts family names from the styles section', () => {
    const ass =
      '[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,48\nStyle: Title,Georgia,36\n\n[Events]\nFormat: Layer, Start\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,hi';
    expect(extractAssFamilies(ass)).toEqual(['Arial', 'Georgia']);
  });

  it('ignores style lines outside the styles section', () => {
    const ass = '[Events]\nFormat: Layer, Start\nStyle: Default,Arial,48';
    expect(extractAssFamilies(ass)).toEqual([]);
  });

  it('deduplicates repeated families', () => {
    const ass =
      '[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: A,Arial,48\nStyle: B,Arial,24';
    expect(extractAssFamilies(ass)).toEqual(['Arial']);
  });
});

describe('hexToAssColor', () => {
  it('converts rgb to BGR ass color', () => {
    expect(hexToAssColor('#ff0000')).toBe('&H000000ff&');
    expect(hexToAssColor('#00ff00')).toBe('&H0000ff00&');
    expect(hexToAssColor('#0000ff')).toBe('&H00ff0000&');
  });

  it('returns empty string for invalid hex', () => {
    expect(hexToAssColor('red')).toBe('');
    expect(hexToAssColor('#12345')).toBe('');
    expect(hexToAssColor('#1234567')).toBe('');
  });

  it('accepts hex without leading #', () => {
    expect(hexToAssColor('ffffff')).toBe('&H00ffffff&');
  });
});

describe('htmlToAssTags', () => {
  it('converts italic and bold tags', () => {
    expect(htmlToAssTags('<i>em</i> and <b>strong</b>')).toBe(
      '{\\i1}em{\\i0} and {\\b1}strong{\\b0}'
    );
  });

  it('converts <strong> and <em>', () => {
    expect(htmlToAssTags('<strong>s</strong> <em>e</em>')).toBe(
      '{\\b1}s{\\b0} {\\i1}e{\\i0}'
    );
  });

  it('converts underline', () => {
    expect(htmlToAssTags('<u>under</u>')).toBe('{\\u1}under{\\u0}');
  });

  it('applies font color', () => {
    expect(htmlToAssTags('<font color="#ff0000">red</font>')).toBe(
      '{\\c&H000000ff&}red'
    );
  });

  it('keeps font content when color is invalid', () => {
    expect(htmlToAssTags('<font color="nope">text</font>')).toBe('text');
  });

  it('strips unknown tags and decodes entities', () => {
    expect(htmlToAssTags('a <br> b &amp; c &lt;d&gt;')).toBe('a  b & c <d>');
  });

  it('trims surrounding whitespace', () => {
    expect(htmlToAssTags('  padded  ')).toBe('padded');
  });
});

describe('srtToAss (via convertToAss)', () => {
  it('converts an SRT block to a Dialogue line', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello <i>world</i>';
    const out = convertToAss({ format: 'srt', content: srt });
    expect(out).toContain('Dialogue: 0,00:00:01.00,00:00:03.50,Default,,0,0,0,,Hello {\\i1}world{\\i0}\n');
  });

  it('accepts dot as milliseconds separator', () => {
    const srt = '1\n00:00:01.000 --> 00:00:02.000\nx';
    const out = convertToAss({ format: 'srt', content: srt });
    expect(out).toContain('00:00:01.00,00:00:02.00');
  });

  it('joins multiline text with \\N', () => {
    const srt = '1\n00:00:01.000 --> 00:00:02.000\nline one\nline two';
    const out = convertToAss({ format: 'srt', content: srt });
    expect(out).toContain('line one\\Nline two');
  });

  it('skips malformed blocks', () => {
    const srt = 'garbage\n\n1\n00:00:01.000 --> 00:00:02.000\nok';
    const out = convertToAss({ format: 'srt', content: srt });
    expect(out).not.toContain('garbage');
    expect(out).toContain('ok');
  });

  it('always emits the ASS header', () => {
    expect(convertToAss({ format: 'srt', content: '1\n00:00:01.000 --> 00:00:02.000\nx' })).toContain(
      ASS_HEADER
    );
  });
});

describe('vttToAss (via convertToAss)', () => {
  it('skips WEBVTT header and Kind/Language lines', () => {
    const vtt =
      'WEBVTT\nKind: captions\nLanguage: en\n\n00:00:01.000 --> 00:00:02.000\nhello';
    const out = convertToAss({ format: 'vtt', content: vtt });
    expect(out).not.toContain('WEBVTT');
    expect(out).not.toContain('Kind');
    expect(out).toContain('hello');
  });

  it('converts cue with multiline text', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na\nb';
    const out = convertToAss({ format: 'vtt', content: vtt });
    expect(out).toContain('a\\Nb');
  });

  it('ignores non-cue lines', () => {
    const vtt = 'WEBVTT\nNOTE comment\n\n00:00:01.000 --> 00:00:02.000\nx';
    const out = convertToAss({ format: 'vtt', content: vtt });
    expect(out).not.toContain('NOTE');
    expect(out).toContain('x');
  });
});

describe('convertToAss routing', () => {
  it('passes ASS content through unchanged', () => {
    const content = '[Script Info]\nwhatever';
    expect(convertToAss({ format: 'ass', content })).toBe(content);
  });

  it('passes SSA content through unchanged', () => {
    const content = '[Script Info]\nwhatever';
    expect(convertToAss({ format: 'ssa', content })).toBe(content);
  });

  it('returns empty for missing content', () => {
    expect(convertToAss({ format: 'srt' })).toBe('');
    expect(convertToAss({ format: 'srt', content: '' })).toBe('');
  });

  it('falls back to SRT conversion for unknown formats', () => {
    const out = convertToAss({ format: 'sub', content: '1\n00:00:01.000 --> 00:00:02.000\nx' });
    expect(out).toContain('Dialogue: 0,00:00:01.00,00:00:02.00');
  });
});
