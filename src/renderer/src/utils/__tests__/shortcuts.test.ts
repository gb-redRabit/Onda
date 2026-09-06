import { describe, it, expect } from 'vitest';
import { matchesShortcut } from '../shortcuts';
import { DEFAULT_SHORTCUTS } from '../constants';

function keyEvent(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return { key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...partial } as KeyboardEvent;
}

describe('matchesShortcut', () => {
  it('matches Ctrl+K', () => {
    expect(matchesShortcut('Ctrl+K', keyEvent({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(matchesShortcut('Ctrl+K', keyEvent({ key: 'K', ctrlKey: true }))).toBe(true);
    expect(matchesShortcut('Ctrl+K', keyEvent({ key: 'k' }))).toBe(false);
    expect(matchesShortcut('Ctrl+K', keyEvent({ key: 'k', shiftKey: true, ctrlKey: true }))).toBe(false);
  });

  it('matches Alt+1', () => {
    expect(matchesShortcut('Alt+1', keyEvent({ key: '1', altKey: true }))).toBe(true);
    expect(matchesShortcut('Alt+1', keyEvent({ key: '1' }))).toBe(false);
  });

  it('matches modifiers Meta', () => {
    expect(matchesShortcut('Meta+K', keyEvent({ key: 'k', metaKey: true }))).toBe(true);
    expect(matchesShortcut('Meta+K', keyEvent({ key: 'k', ctrlKey: true }))).toBe(false);
  });

  it('matches Space / Enter / Escape', () => {
    expect(matchesShortcut('Space', keyEvent({ key: ' ' }))).toBe(true);
    expect(matchesShortcut('Enter', keyEvent({ key: 'Enter' }))).toBe(true);
    expect(matchesShortcut('Escape', keyEvent({ key: 'Escape' }))).toBe(true);
  });

  it('matches F-keys, arrows and media keys', () => {
    expect(matchesShortcut('F5', keyEvent({ key: 'F5' }))).toBe(true);
    expect(matchesShortcut('ArrowUp', keyEvent({ key: 'ArrowUp' }))).toBe(true);
    expect(matchesShortcut('MediaTrackNext', keyEvent({ key: 'MediaTrackNext' }))).toBe(true);
  });

  it('matches single char keys', () => {
    expect(matchesShortcut('M', keyEvent({ key: 'm' }))).toBe(true);
    expect(matchesShortcut('M', keyEvent({ key: 'x' }))).toBe(false);
  });

  it('rejects three-modifier overrides', () => {
    expect(matchesShortcut('Ctrl+Shift+Z', keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchesShortcut('Ctrl+Shift+Z', keyEvent({ key: 'z', ctrlKey: true }))).toBe(false);
  });

  it('matches every default shortcut against a real key event', () => {
    const cases: Array<[string, Partial<KeyboardEvent>]> = [
      ['play-pause', { key: ' ' }],
      ['skip-forward', { key: 'ArrowRight' }],
      ['skip-backward', { key: 'ArrowLeft' }],
      ['volume-up', { key: 'ArrowUp' }],
      ['volume-down', { key: 'ArrowDown' }],
      ['mute', { key: 'm' }],
      ['fullscreen', { key: 'f' }],
      ['speed-up', { key: '>', shiftKey: true }],
      ['speed-down', { key: '<', shiftKey: true }],
      ['jump-start', { key: '0' }],
      ['next-track', { key: 'MediaTrackNext' }],
      ['prev-track', { key: 'MediaTrackPrevious' }],
      ['search', { key: 'k', ctrlKey: true }],
      ['view-search', { key: 'f', ctrlKey: true }],
      ['settings', { key: ',', ctrlKey: true }],
      ['explorer', { key: 'e', ctrlKey: true }],
      ['library', { key: 'l', ctrlKey: true }],
      ['home', { key: 'h', ctrlKey: true }]
    ];
    for (const [action, e] of cases) {
      const shortcut = DEFAULT_SHORTCUTS[action];
      expect(shortcut).toBeTruthy();
      expect(matchesShortcut(shortcut!, keyEvent(e))).toBe(true);
    }
  });

  it('skip shortcuts ignore a held Shift so ±30s stays reachable', () => {
    const shortcut = DEFAULT_SHORTCUTS['skip-forward'];
    expect(matchesShortcut(shortcut!, keyEvent({ key: 'ArrowRight' }))).toBe(true);
    // strict match rejects the held Shift, and the matching pass used for
    // ±30s strips Shift before retrying — so both branches must be true.
    expect(matchesShortcut(shortcut!, keyEvent({ key: 'ArrowRight', shiftKey: true }))).toBe(false);
    expect(matchesShortcut(shortcut!, keyEvent({ key: 'ArrowRight' }))).toBe(true);
  });
});