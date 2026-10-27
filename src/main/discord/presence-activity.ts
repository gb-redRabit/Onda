import type { PresenceState } from '../../shared/types/discord';

const MAX_TEXT = 128;

export interface DiscordActivity {
  type: number;
  details: string;
  state?: string;
  timestamps?: { start?: number; end?: number };
  assets?: { large_image: string; large_text?: string };
}

function truncate(value: string): string {
  const text = value.trim();
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT - 1)}…`;
}

/**
 * Mapuje stan odtwarzania na activity Discorda. Zwraca `null`, gdy nic nie gra
 * (manager wtedy czyści presence). Radio/stream nie ma czasu trwania → bez paska postępu.
 */
export function buildActivity(state: PresenceState | null): DiscordActivity | null {
  if (!state || !state.isPlaying) return null;
  const activity: DiscordActivity = {
    // 2 = Listening, 3 = Watching.
    type: state.kind === 'video' ? 3 : 2,
    details: truncate(state.title || 'Unknown'),
    assets: {
      large_image: state.coverUrl || 'onda_logo',
      large_text: truncate(state.album || 'Onda')
    }
  };

  const stateText = [state.artist, state.album]
    .filter((value): value is string => !!value)
    .join(' · ');
  if (stateText) activity.state = truncate(stateText);

  if (state.durationSec && state.durationSec > 0) {
    const now = Date.now();
    const position = Math.max(0, Math.min(state.positionSec ?? 0, state.durationSec));
    activity.timestamps = {
      start: Math.round(now - position * 1000),
      end: Math.round(now + (state.durationSec - position) * 1000)
    };
  }

  return activity;
}
