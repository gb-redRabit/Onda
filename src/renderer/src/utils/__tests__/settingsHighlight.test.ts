import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_HIGHLIGHT_CLASS,
  clearSettingsHighlight,
  highlightSettingsElement,
  waitForSettingElement
} from '../settingsHighlight';

describe('settingsHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    clearSettingsHighlight();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('adds the highlight class to the target element', () => {
    const el = document.createElement('div');
    highlightSettingsElement(el);
    expect(el.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(true);
  });

  it('removes the class after the default duration', () => {
    const el = document.createElement('div');
    highlightSettingsElement(el);
    vi.advanceTimersByTime(1600);
    expect(el.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(false);
  });

  it('respects a custom duration', () => {
    const el = document.createElement('div');
    highlightSettingsElement(el, 500);
    vi.advanceTimersByTime(499);
    expect(el.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(false);
  });

  it('moves the highlight when a new element is targeted', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');

    highlightSettingsElement(first);
    highlightSettingsElement(second);

    expect(first.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(false);
    expect(second.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(true);
  });

  it('clears the highlight and cancels the pending timer', () => {
    const el = document.createElement('div');
    highlightSettingsElement(el);

    clearSettingsHighlight();

    expect(el.classList.contains(SETTINGS_HIGHLIGHT_CLASS)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('waitForSettingElement', () => {
    it('returns the element immediately when it is already mounted', async () => {
      const el = document.createElement('div');
      el.id = 'setting-ready';
      document.body.appendChild(el);

      await expect(waitForSettingElement('setting-ready')).resolves.toBe(el);
    });

    it('waits for a lazily mounted element', async () => {
      const pending = waitForSettingElement('setting-late');

      await vi.advanceTimersByTimeAsync(90);
      const el = document.createElement('div');
      el.id = 'setting-late';
      document.body.appendChild(el);
      await vi.advanceTimersByTimeAsync(60);

      await expect(pending).resolves.toBe(el);
    });

    it('resolves null when the element never appears', async () => {
      const pending = waitForSettingElement('setting-missing');

      await vi.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toBeNull();
    });
  });
});
