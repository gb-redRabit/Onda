import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { APP_PATH, isAllowedNavigationUrl } from '../navigation-policy';

const DEV_URL = 'http://localhost:5173';

describe('isAllowedNavigationUrl', () => {
  it('allows file: URLs inside the app directory', () => {
    const inside = pathToFileURL(join(APP_PATH, 'renderer', 'index.html')).toString();
    expect(isAllowedNavigationUrl(inside, undefined)).toBe(true);
    expect(isAllowedNavigationUrl(`${inside}#/player`, undefined)).toBe(true);
  });

  it('blocks file: URLs outside the app directory', () => {
    // Regression: every file: URL used to be allowed (local file read primitive).
    expect(isAllowedNavigationUrl('file:///etc/passwd', undefined)).toBe(false);
    expect(isAllowedNavigationUrl('file:///C:/Windows/System32/cmd.exe', undefined)).toBe(false);
    expect(isAllowedNavigationUrl('file:///tmp/evil.html', DEV_URL)).toBe(false);
  });

  it('blocks a sibling path that only shares the app path prefix', () => {
    const sibling = pathToFileURL(`${APP_PATH}-malicious/index.html`).toString();
    expect(isAllowedNavigationUrl(sibling, undefined)).toBe(false);
  });

  it('allows onda: protocol URLs', () => {
    expect(isAllowedNavigationUrl('onda://thumbnail?path=%2Fhome', undefined)).toBe(true);
  });

  it('allows the dev server origin in dev mode', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173/#/explorer', DEV_URL)).toBe(true);
    expect(isAllowedNavigationUrl('http://localhost:5173/pip.html', DEV_URL)).toBe(true);
  });

  it('blocks dev server URLs when not in dev mode', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173/', undefined)).toBe(false);
  });

  it('allows data: URLs only with allowData', () => {
    const dataUrl = 'data:text/html;charset=utf-8,%3Ch1%3Ehi%3C%2Fh1%3E';
    expect(isAllowedNavigationUrl(dataUrl, undefined)).toBe(false);
    expect(isAllowedNavigationUrl(dataUrl, undefined, { allowData: true })).toBe(true);
  });

  it('blocks remote navigation (main threat: YouTube iframe escape)', () => {
    expect(isAllowedNavigationUrl('https://www.youtube.com/', DEV_URL)).toBe(false);
    expect(isAllowedNavigationUrl('https://evil.example.com/phish', DEV_URL)).toBe(false);
    expect(isAllowedNavigationUrl('http://192.168.1.1/', undefined)).toBe(false);
  });

  it('blocks other localhost ports and schemes', () => {
    expect(isAllowedNavigationUrl('http://localhost:9999/', DEV_URL)).toBe(false);
    expect(isAllowedNavigationUrl('javascript:alert(1)', DEV_URL)).toBe(false);
    expect(isAllowedNavigationUrl('smb://server/share', DEV_URL)).toBe(false);
  });

  it('blocks malformed URLs', () => {
    expect(isAllowedNavigationUrl('not a url', DEV_URL)).toBe(false);
    expect(isAllowedNavigationUrl('', DEV_URL)).toBe(false);
  });
});
