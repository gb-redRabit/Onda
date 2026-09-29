import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../useTheme';
import { DEFAULT_APPEARANCE } from '@renderer/utils/constants';
import type { AppearanceSettings } from '@renderer/types/settings';

const originalInvoke = window.api.invoke;

describe('useTheme window material', () => {
  afterEach(() => {
    window.api.invoke = originalInvoke;
    vi.clearAllMocks();
  });

  it('only switches acrylic/auto at the glass threshold and avoids repeat IPC calls', async () => {
    const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, glassAlpha: 70 });
    const invoke = vi.fn().mockResolvedValue(true);
    window.api.invoke = invoke as typeof window.api.invoke;
    const theme = useTheme(appearance);

    theme.applyTheme();
    expect(invoke).toHaveBeenLastCalledWith('app:setBackgroundMaterial', 'acrylic');
    const initialCalls = invoke.mock.calls.length;

    appearance.value.glassAlpha = 35;
    await nextTick();
    expect(invoke).toHaveBeenCalledTimes(initialCalls);

    appearance.value.glassAlpha = 100;
    await nextTick();
    expect(invoke).toHaveBeenLastCalledWith('app:setBackgroundMaterial', 'auto');
    expect(invoke).toHaveBeenCalledTimes(initialCalls + 1);
  });
});
