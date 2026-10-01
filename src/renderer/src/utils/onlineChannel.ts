import { buildSoundcloudProfileUrl, buildYouTubeHandleUrl } from '@shared/provider';

export interface ChannelPrefix {
  platform: 'youtube' | 'soundcloud';
  name: string;
}

export function channelUrlForPrefix(prefix: ChannelPrefix): string {
  return prefix.platform === 'youtube'
    ? buildYouTubeHandleUrl(prefix.name)
    : buildSoundcloudProfileUrl(prefix.name);
}
