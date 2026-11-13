import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedAppOrigin } from '../origin-guard';

// CORS guard: file:// / "null" origins pass, dev server only when its exact
// origin matches ELECTRON_RENDERER_URL, everything else is rejected.

function setRendererUrl(value: string | undefined): void {
  vi.stubEnv('ELECTRON_RENDERER_URL', value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('allowedAppOrigin', () => {
  it('rejects missing origins', () => {
    expect(allowedAppOrigin(null)).toBeNull();
    expect(allowedAppOrigin(undefined)).toBeNull();
    expect(allowedAppOrigin('')).toBeNull();
  });

  it('passes the literal null origin used by file:// pages', () => {
    expect(allowedAppOrigin('null')).toBe('null');
    expect(allowedAppOrigin('file://')).toBe('file://');
    expect(allowedAppOrigin('file:///C:/app/index.html')).toBe('file:///C:/app/index.html');
  });

  it('rejects malformed origins', () => {
    expect(allowedAppOrigin('not a url')).toBeNull();
  });

  it('rejects http origins when no dev server is configured', () => {
    setRendererUrl(undefined);
    expect(allowedAppOrigin('http://localhost:5173')).toBeNull();
  });

  it('allows only the exact configured dev-server origin', () => {
    setRendererUrl('http://localhost:5173/');

    expect(allowedAppOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(allowedAppOrigin('http://localhost:5174')).toBeNull();
    expect(allowedAppOrigin('https://localhost:5173')).toBeNull();
  });

  it('rejects when the configured dev-server URL is malformed', () => {
    setRendererUrl('not a url');

    expect(allowedAppOrigin('http://localhost:5173')).toBeNull();
  });
});
