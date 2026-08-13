import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

export function useAppMenu() {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const isMaximized = ref(false);
  const openDropdown = ref<string | null>(null);

  function closeDropdown() {
    openDropdown.value = null;
  }

  function toggleDropdown(name: string) {
    openDropdown.value = openDropdown.value === name ? null : name;
  }

  function onClickAway(e: MouseEvent) {
    if (!openDropdown.value) return;
    const el = document.querySelector('[data-app-menu]') as HTMLElement | null;
    if (!el?.contains(e.target as Node)) closeDropdown();
  }

  async function openFile() {
    const result = (await window.api?.invoke('dialog:openFile')) as
      { filePaths: string[]; canceled: boolean } | undefined;
    if (!result || result.canceled || !result.filePaths.length) return;
    await openMediaFiles(result.filePaths, router);
  }

  async function openFolder() {
    const result = (await window.api?.invoke('dialog:openFolderFiles')) as
      { filePaths: string[]; canceled: boolean } | undefined;
    if (!result || result.canceled || !result.filePaths.length) return;
    await openMediaFiles(result.filePaths, router);
  }

  function minimize() {
    window.api?.invoke('window:minimize');
  }
  function maximize() {
    window.api?.invoke('window:maximize');
  }
  function closeWin() {
    window.api?.invoke('window:close');
  }
  function quitApp() {
    window.api?.invoke('app:quit');
  }

  function onKeydown(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const map: Record<string, string> = {
      '1': '/',
      '2': '/library',
      '3': '/explorer',
      '4': '/youtube',
      '5': '/downloads',
      '6': '/settings'
    };
    const path = map[e.key];
    if (path) {
      e.preventDefault();
      router.push(path);
    }
  }

  function onMaximized(val: unknown) {
    isMaximized.value = val as boolean;
  }

  const viewLabel = computed(() => {
    const map: Record<string, string> = {
      home: t('nav.home'),
      library: t('nav.library'),
      player: t('nav.player'),
      audio: t('nav.player'),
      settings: t('nav.settings')
    };
    return map[route.name as string] || '';
  });

  const showViewActions = computed(() =>
    ['home', 'library', 'player', 'audio', 'settings'].includes(route.name as string)
  );

  function navigateAndClose(path: string) {
    router.push(path);
    closeDropdown();
  }

  let offMaximized: (() => void) | null = null;
  onMounted(() => {
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('click', onClickAway);
    offMaximized = window.api?.on('window:maximized', onMaximized) ?? null;
  });
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onClickAway);
    offMaximized?.();
  });

  return {
    isMaximized,
    openDropdown,
    viewLabel,
    showViewActions,
    openFile,
    openFolder,
    toggleDropdown,
    closeDropdown,
    minimize,
    maximize,
    closeWin,
    quitApp,
    navigateAndClose
  };
}
