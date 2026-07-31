import { ref, nextTick } from 'vue';

export function usePromptDialog() {
  const promptVisible = ref(false);
  const promptMessage = ref('');
  const promptValue = ref('');
  const promptIsConfirm = ref(false);
  let _promptResolve: ((v: string | null) => void) | null = null;
  let _confirmResolve: ((v: boolean) => void) | null = null;

  function showConfirm(msg: string): Promise<boolean> {
    promptMessage.value = msg;
    promptIsConfirm.value = true;
    promptVisible.value = true;
    return new Promise((r) => {
      _confirmResolve = r;
    });
  }

  function showPrompt(msg: string, val = ''): Promise<string | null> {
    promptMessage.value = msg;
    promptValue.value = val;
    promptIsConfirm.value = false;
    promptVisible.value = true;
    nextTick(() => {
      const el = document.getElementById('prompt-input') as HTMLInputElement;
      el?.focus();
      el?.select();
    });
    return new Promise((r) => {
      _promptResolve = r;
    });
  }

  function promptConfirm() {
    if (promptIsConfirm.value) {
      _confirmResolve?.(true);
    } else {
      _promptResolve?.(promptValue.value);
    }
    promptVisible.value = false;
  }

  function promptCancel() {
    if (promptIsConfirm.value) {
      _confirmResolve?.(false);
    } else {
      _promptResolve?.(null);
    }
    promptVisible.value = false;
  }

  function promptKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') promptConfirm();
    if (e.key === 'Escape') promptCancel();
  }

  return {
    promptVisible,
    promptMessage,
    promptValue,
    promptIsConfirm,
    showConfirm,
    showPrompt,
    promptConfirm,
    promptCancel,
    promptKeydown
  };
}
