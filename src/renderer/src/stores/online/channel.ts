import { computed, ref } from 'vue';
import { detectPlatform } from '@shared/platform';
import type { YouTubeChannel, YouTubeVideo } from '@renderer/types/online';

// Channel/profile browsing state + actions (YouTube channels and SoundCloud
// profiles). Kept separate from the store so the channel concern is testable in
// isolation; the store destructures the returned refs/actions back into the
// same names, so call sites elsewhere are unchanged.
export function createOnlineChannel() {
  const channel = ref<YouTubeChannel | null>(null);
  const channelInput = ref('');
  const channelTab = ref<'videos' | 'shorts'>('videos');
  const channelHasShorts = ref(true);
  const channelViewMode = ref<'grid' | 'list'>('grid');
  const channelLoading = ref(false);
  const channelError = ref('');
  const channelErrorCode = ref('');
  const channelVideos = ref<YouTubeVideo[]>([]);
  const channelVideosHasMore = ref(false);
  const channelVideosOffset = ref(0);
  const channelVideosLoaded = ref(false);
  const channelShorts = ref<YouTubeVideo[]>([]);
  const channelShortsHasMore = ref(false);
  const channelShortsOffset = ref(0);
  const channelShortsLoaded = ref(false);
  // True while browsing a SoundCloud profile — switches the IPC channel and
  // disables the shorts tab / subscribe UI for it.
  const channelIsSc = ref(false);
  let channelKey = 0;

  const channelItems = computed(() =>
    channelTab.value === 'shorts' ? channelShorts.value : channelVideos.value
  );
  const channelHasMore = computed(() =>
    channelTab.value === 'shorts' ? channelShortsHasMore.value : channelVideosHasMore.value
  );

  async function openChannel(input: string) {
    channelKey++;
    channel.value = null;
    channelInput.value = input;
    channelIsSc.value = detectPlatform(input)?.platform === 'soundcloud';
    channelTab.value = 'videos';
    channelHasShorts.value = !channelIsSc.value;
    channelError.value = '';
    channelErrorCode.value = '';
    channelVideos.value = [];
    channelVideosHasMore.value = false;
    channelVideosOffset.value = 0;
    channelVideosLoaded.value = false;
    channelShorts.value = [];
    channelShortsHasMore.value = false;
    channelShortsOffset.value = 0;
    channelShortsLoaded.value = false;
    await loadChannelTab('videos');
  }

  async function switchChannelTab(tab: 'videos' | 'shorts') {
    if (channelIsSc.value) return;
    if (channelTab.value === tab) return;
    if (tab === 'shorts' && !channelHasShorts.value) return;
    channelTab.value = tab;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!loaded) await loadChannelTab(tab);
  }

  async function loadChannelTab(tab: 'videos' | 'shorts') {
    const key = ++channelKey;
    channelError.value = '';
    channelErrorCode.value = '';
    channelLoading.value = true;
    try {
      const res = channelIsSc.value
        ? await window.api.invoke('sc:channel', { url: channelInput.value })
        : await window.api.invoke('yt:channel', { url: channelInput.value, tab });
      if (key !== channelKey) return;
      if (res && res.success && res.channel) {
        channel.value = res.channel;
        if (tab === 'shorts') {
          channelShorts.value = res.items;
          channelShortsHasMore.value = res.hasMore;
          channelShortsOffset.value = res.items.length;
          channelShortsLoaded.value = true;
        } else {
          channelVideos.value = res.items;
          channelVideosHasMore.value = res.hasMore;
          channelVideosOffset.value = res.items.length;
          channelVideosLoaded.value = true;
        }
      } else if (res && res.error === 'no_shorts_tab') {
        channelHasShorts.value = false;
        if (tab === 'shorts') {
          channelTab.value = 'videos';
          if (!channelVideosLoaded.value) await loadChannelTab('videos');
        }
      } else {
        channelError.value = res?.error || 'Could not load this channel';
        channelErrorCode.value = res?.code || '';
      }
    } catch {
      if (key === channelKey) channelError.value = 'Could not load this channel';
    } finally {
      if (key === channelKey) channelLoading.value = false;
    }
  }

  async function loadMoreChannel() {
    const tab = channelTab.value;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!channel.value || channelLoading.value || !loaded) return;
    channelLoading.value = true;
    const key = channelKey;
    const offset = tab === 'shorts' ? channelShortsOffset.value : channelVideosOffset.value;
    try {
      const res = channelIsSc.value
        ? await window.api.invoke('sc:channel', {
            url: channelInput.value,
            start: offset + 1,
            end: offset + 30
          })
        : await window.api.invoke('yt:channel', {
            url: channelInput.value,
            tab,
            start: offset + 1,
            end: offset + 30
          });
      if (key !== channelKey) return;
      if (res && res.success) {
        if (tab === 'shorts') {
          channelShorts.value.push(...res.items);
          channelShortsHasMore.value = res.hasMore;
          channelShortsOffset.value += res.items.length;
        } else {
          channelVideos.value.push(...res.items);
          channelVideosHasMore.value = res.hasMore;
          channelVideosOffset.value += res.items.length;
        }
      }
    } catch {
      if (key === channelKey) channelError.value = 'Could not load this channel';
    } finally {
      if (key === channelKey) channelLoading.value = false;
    }
  }

  function setChannelViewMode(mode: 'grid' | 'list') {
    channelViewMode.value = mode;
  }

  function closeChannel() {
    channelKey++;
    channel.value = null;
    channelInput.value = '';
    channelIsSc.value = false;
    channelTab.value = 'videos';
    channelHasShorts.value = true;
    channelError.value = '';
    channelErrorCode.value = '';
    channelVideos.value = [];
    channelVideosHasMore.value = false;
    channelVideosOffset.value = 0;
    channelVideosLoaded.value = false;
    channelShorts.value = [];
    channelShortsHasMore.value = false;
    channelShortsOffset.value = 0;
    channelShortsLoaded.value = false;
    channelLoading.value = false;
  }

  return {
    channel,
    channelInput,
    channelTab,
    channelHasShorts,
    channelViewMode,
    channelLoading,
    channelError,
    channelErrorCode,
    channelVideos,
    channelVideosHasMore,
    channelVideosOffset,
    channelVideosLoaded,
    channelShorts,
    channelShortsHasMore,
    channelShortsOffset,
    channelShortsLoaded,
    channelIsSc,
    channelItems,
    channelHasMore,
    openChannel,
    switchChannelTab,
    loadChannelTab,
    loadMoreChannel,
    setChannelViewMode,
    closeChannel
  };
}
