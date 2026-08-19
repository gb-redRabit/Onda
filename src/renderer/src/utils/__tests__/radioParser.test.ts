import { describe, it, expect } from 'vitest';
import { parsePls, parseM3u, parseXspf, parseDirectUrl, parseRadioFile } from '../radioParser';

describe('radioParser', () => {
  describe('parsePls', () => {
    it('parses a single-entry pls', () => {
      const pls = `[playlist]
File1=http://radio.example:8000/stream
Title1=Test FM
Length1=-1
NumberOfEntries=1`;
      expect(parsePls(pls)).toEqual([{ name: 'Test FM', url: 'http://radio.example:8000/stream' }]);
    });

    it('parses a multi-entry pls preserving order', () => {
      const pls = `[playlist]
File2=http://radio2.example/live
Title2=Rock FM
File1=http://radio1.example/live
Title1=Pop FM
NumberOfEntries=2`;
      expect(parsePls(pls).map((s) => s.name)).toEqual(['Pop FM', 'Rock FM']);
    });

    it('falls back to url as name and handles unnumbered entries', () => {
      expect(parsePls('File=http://radio.example/live\nTitle=Plain FM')).toEqual([
        { name: 'Plain FM', url: 'http://radio.example/live' }
      ]);
      expect(parsePls('File1=http://radio.example/live\nNumberOfEntries=1')[0]?.name).toBe(
        'http://radio.example/live'
      );
    });

    it('rejects non-http(s) urls', () => {
      expect(parsePls('File1=ftp://radio.example/live\nTitle1=X')).toEqual([]);
    });
  });

  describe('parseM3u', () => {
    it('parses extended m3u with titles', () => {
      const m3u = `#EXTM3U
#EXTINF:123,First Station
http://radio1.example/live
#EXTINF:-1,Second Station
http://radio2.example/live.mp3`;
      expect(parseM3u(m3u)).toEqual([
        { name: 'First Station', url: 'http://radio1.example/live' },
        { name: 'Second Station', url: 'http://radio2.example/live.mp3' }
      ]);
    });

    it('parses plain url-per-line m3u', () => {
      expect(parseM3u('http://radio1.example/live\nhttp://radio2.example/live')).toHaveLength(2);
    });

    it('tolerates comments and blank lines', () => {
      const m3u = `# comment
http://radio.example/live

# another
`;
      expect(parseM3u(m3u)).toEqual([{ name: 'http://radio.example/live', url: 'http://radio.example/live' }]);
    });
  });

  describe('parseXspf', () => {
    it('parses xspf tracks', () => {
      const xspf = `<?xml version="1.0"?>
<playlist version="1" xmlns="http://xspf.org/ns/0/">
  <trackList>
    <track>
      <title>Jazz FM &amp; Co</title>
      <location>http://jazz.example:9000/stream</location>
    </track>
    <track>
      <title>Ambient</title>
      <location>https://ambient.example/live.aac</location>
    </track>
  </trackList>
</playlist>`;
      expect(parseXspf(xspf)).toEqual([
        { name: 'Jazz FM & Co', url: 'http://jazz.example:9000/stream' },
        { name: 'Ambient', url: 'https://ambient.example/live.aac' }
      ]);
    });
  });

  describe('parseDirectUrl', () => {
    it('accepts http(s) urls', () => {
      expect(parseDirectUrl('  http://radio.example:8000/stream  ')).toEqual({
        name: 'http://radio.example:8000/stream',
        url: 'http://radio.example:8000/stream'
      });
      expect(parseDirectUrl('https://radio.example/live.aac')).not.toBeNull();
    });

    it('rejects garbage and non-http schemes', () => {
      expect(parseDirectUrl('not a url')).toBeNull();
      expect(parseDirectUrl('file:///x')).toBeNull();
      expect(parseDirectUrl('ftp://radio.example/x')).toBeNull();
    });
  });

  describe('parseRadioFile', () => {
    it('sniffs content when the extension is unknown', () => {
      expect(parseRadioFile('stations.txt', '[playlist]\nFile1=http://r.example/live\nTitle1=A')[0]?.name).toBe('A');
      expect(parseRadioFile('stations.txt', '#EXTM3U\nhttp://r.example/live')).toHaveLength(1);
      expect(parseRadioFile('stations.txt', '<playlist><trackList><track><title>T</title><location>http://r.example/live</location></track></trackList></playlist>')[0]?.name).toBe('T');
    });

    it('uses the extension first', () => {
      const pls = parseRadioFile('x.pls', 'File1=http://r.example/live\nTitle1=A');
      expect(pls).toHaveLength(1);
      const m3u = parseRadioFile('x.m3u8', '#EXTM3U\n#EXTINF:1,B\nhttp://r.example/live');
      expect(m3u[0]?.name).toBe('B');
    });
  });
});