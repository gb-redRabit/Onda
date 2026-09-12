import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';
import type { useVideoPlayer } from './useVideoPlayer';

interface VideoCtx {
  vp?: ReturnType<typeof useVideoPlayer>;
  setSpeed: (s: number) => void;
  currentSpeed: number;
}

interface AudioCtx {
  setSpeed: (s: number) => void;
  currentSpeed: number;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function usePlayerContextMenu() {
  const { t } = useI18n();
  const player = usePlayerStore();
  const settings = useSettingsStore();
  const { open } = useContextMenu();

  function speedDefs(ctx: AudioCtx): ContextMenuAction<AudioCtx>[] {
    return SPEEDS.map((s) => ({
      label: `${s}x`,
      checked: s === ctx.currentSpeed,
      action: () => ctx.setSpeed(s)
    }));
  }

  function subtitleDefs(): ContextMenuAction<VideoCtx>[] {
    const items: ContextMenuAction<VideoCtx>[] = player.subtitleTracks.map((s) => ({
      label: s.label || s.language || s.id,
      checked: s.id === player.activeSubtitleId,
      action: () => player.setActiveSubtitle(s.id === player.activeSubtitleId ? null : s.id)
    }));
    return [
      {
        label: t('player.subtitlesOff'),
        checked: player.activeSubtitleId === null,
        action: () => player.setActiveSubtitle(null)
      },
      ...(items.length ? [{ separator: true, label: '' }] : []),
      ...items
    ];
  }

  function showVideoMenu(e: MouseEvent, ctx: VideoCtx) {
    const defs: ContextMenuAction<VideoCtx>[] = [
      {
        label: player.isPlaying ? t('common.pause') : t('common.play'),
        action: () => player.togglePlay()
      },
      {
        label: player.isMuted ? t('player.unmute') : t('common.mute'),
        action: () => player.toggleMute()
      },
      {
        label: t('player.pipVideo'),
        action: () => ctx.vp?.togglePiP()
      },
      {
        label: t('player.subtitles'),
        children: subtitleDefs()
      },
      {
        label: t('player.speed'),
        children: speedDefs(ctx)
      }
    ];
    open(e, defs, ctx);
  }

  function showAudioMenu(e: MouseEvent, ctx: AudioCtx) {
    const defs: ContextMenuAction<AudioCtx>[] = [
      {
        label: player.isPlaying ? t('common.pause') : t('common.play'),
        action: () => player.togglePlay()
      },
      {
        label: player.isMuted ? t('player.unmute') : t('common.mute'),
        action: () => player.toggleMute()
      },
      {
        label: t('player.speed'),
        children: speedDefs(ctx)
      }
    ];
    open(e, defs, ctx);
  }

  return { showVideoMenu, showAudioMenu, speed: settings.playback.playbackSpeed };
}
