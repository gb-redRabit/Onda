import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { usePromptDialog } from '../usePromptDialog';

describe('confirm dialog', () => {
  it('shows a confirm and resolves true', async () => {
    const dialog = usePromptDialog();

    const result = dialog.showConfirm('Delete?');
    expect(dialog.promptVisible.value).toBe(true);
    expect(dialog.promptIsConfirm.value).toBe(true);
    expect(dialog.promptMessage.value).toBe('Delete?');

    dialog.promptConfirm();
    await expect(result).resolves.toBe(true);
    expect(dialog.promptVisible.value).toBe(false);
  });

  it('resolves false when cancelled', async () => {
    const dialog = usePromptDialog();
    const result = dialog.showConfirm('Delete?');

    dialog.promptCancel();

    await expect(result).resolves.toBe(false);
    expect(dialog.promptVisible.value).toBe(false);
  });

  it('ignores keydown keys other than Enter and Escape', () => {
    const dialog = usePromptDialog();
    dialog.showConfirm('Delete?');

    dialog.promptKeydown(new KeyboardEvent('keydown', { key: 'a' }));

    expect(dialog.promptVisible.value).toBe(true);
  });
});

describe('text prompt', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="prompt-input" value="preset" />';
  });

  it('prefills the value, focuses the input and resolves it', async () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    const dialog = usePromptDialog();

    const result = dialog.showPrompt('Name', 'preset');
    expect(dialog.promptIsConfirm.value).toBe(false);
    expect(dialog.promptValue.value).toBe('preset');
    await nextTick();

    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();

    dialog.promptValue.value = 'typed';
    dialog.promptConfirm();
    await expect(result).resolves.toBe('typed');
    expect(dialog.promptVisible.value).toBe(false);
  });

  it('defaults to an empty value and cancels with null', async () => {
    const dialog = usePromptDialog();
    const result = dialog.showPrompt('Name');
    expect(dialog.promptValue.value).toBe('');

    dialog.promptKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(result).resolves.toBeNull();
  });

  it('confirms with Enter', async () => {
    const dialog = usePromptDialog();
    const result = dialog.showPrompt('Name', 'abc');

    dialog.promptKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(result).resolves.toBe('abc');
  });

  it('tolerates confirm/cancel without a pending dialog', () => {
    const dialog = usePromptDialog();

    expect(() => dialog.promptConfirm()).not.toThrow();
    expect(() => dialog.promptCancel()).not.toThrow();
  });

  it('works when the input is not mounted yet', async () => {
    document.body.innerHTML = '';
    const dialog = usePromptDialog();

    dialog.showPrompt('Name');
    await expect(nextTick()).resolves.toBeUndefined();
    expect(dialog.promptVisible.value).toBe(true);
  });
});
