export interface ChannelPrefix {
  platform: 'youtube' | 'soundcloud';
  name: string;
}

export function channelUrlForPrefix(prefix: ChannelPrefix): string {
  return prefix.platform === 'youtube'
    ? `https://www.youtube.com/@${prefix.name}`
    : `https://soundcloud.com/${prefix.name}`;
}
