import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../redact';

describe('redactSecrets', () => {
  it('masks the media-server UUID token in request logs', () => {
    const line =
      '[Onda/media-server] request failed: GET /a5cc8f5b-9077-42d5-8298-8c61d504075c/?path=C%3A%5Cmedia%5Ca.mp4';
    expect(redactSecrets(line)).toBe(
      '[Onda/media-server] request failed: GET /***/?path=C%3A%5Cmedia%5Ca.mp4'
    );
  });

  it('masks secret query parameters in any casing', () => {
    expect(redactSecrets('GET /x?token=abc123&page=2')).toBe('GET /x?token=***&page=2');
    expect(redactSecrets('GET /x?api_key=deadbeef')).toBe('GET /x?api_key=***');
    expect(redactSecrets('GET /x?apiKey=deadbeef')).toBe('GET /x?apiKey=***');
    expect(redactSecrets('GET /x?access_token=deadbeef&sig=1234')).toBe(
      'GET /x?access_token=***&sig=***'
    );
  });

  it('masks authorization and cookie headers', () => {
    expect(redactSecrets('Authorization: Bearer eyJhbGciOi.abc.def')).toBe('Authorization: ***');
    expect(redactSecrets('{"authorization": "Bearer eyJhbGciOi"}')).toBe(
      '{"authorization": "***"}'
    );
    expect(redactSecrets('Cookie: SID=abc; HSID=def')).toBe('Cookie: ***');
    expect(redactSecrets('set-cookie: session=xyz')).toBe('set-cookie: ***');
  });

  it('keeps ordinary paths, ids and hashes intact', () => {
    const line =
      '[Onda/download] finished fileHash=9f2a1c4b8e7d6a5f4c3b2a1908f7e6d5 title=Song.mp3';
    expect(redactSecrets(line)).toBe(line);
    expect(redactSecrets('plugin e2e-channel enabled')).toBe('plugin e2e-channel enabled');
  });
});
