import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getLocale: () => 'en-US' } }));

import {
  normaliseLocale,
  setMainLocale,
  getMainLocale,
  mainMessages,
  initMainLocale
} from '../i18n-main';

describe('main-process i18n', () => {
  it('maps locale tags to a supported locale', () => {
    expect(normaliseLocale('pl-PL')).toBe('pl');
    expect(normaliseLocale('pl')).toBe('pl');
    expect(normaliseLocale('en-US')).toBe('en');
    expect(normaliseLocale(undefined)).toBe('en');
    expect(normaliseLocale('de')).toBe('en');
  });

  it('switches the message table', () => {
    setMainLocale('pl');
    expect(getMainLocale()).toBe('pl');
    expect(mainMessages().openExecOpen).toBe('Otwórz');

    setMainLocale('en');
    expect(mainMessages().openExecOpen).toBe('Open');
  });

  it('parameterises the messages', () => {
    setMainLocale('en');
    expect(mainMessages().openExecMessage('/tmp/x.exe')).toContain('/tmp/x.exe');
    setMainLocale('pl');
    expect(mainMessages().loadFailedMessage(1, 'boom')).toContain('boom');
  });

  it('initialises from the OS locale', () => {
    initMainLocale();
    expect(getMainLocale()).toBe('en');
  });
});
