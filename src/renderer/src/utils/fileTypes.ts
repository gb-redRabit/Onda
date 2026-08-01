const FILE_TYPE_MAP: Record<string, { icon: string; color: string; category: string }> = {
  '.mp3': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.flac': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.wav': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.ogg': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.aac': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.m4a': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.wma': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.opus': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.aiff': { icon: 'music', color: '#f59e0b', category: 'audio' },
  '.mp4': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.mkv': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.avi': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.webm': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.mov': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.wmv': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.flv': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.m4v': { icon: 'film', color: '#3b82f6', category: 'video' },
  '.m3u': { icon: 'list-music', color: '#10b981', category: 'playlist' },
  '.m3u8': { icon: 'list-music', color: '#10b981', category: 'playlist' },
  '.srt': { icon: 'subtitles', color: '#8b5cf6', category: 'subtitle' },
  '.vtt': { icon: 'subtitles', color: '#8b5cf6', category: 'subtitle' },
  '.jpg': { icon: 'image', color: '#ec4899', category: 'image' },
  '.jpeg': { icon: 'image', color: '#ec4899', category: 'image' },
  '.png': { icon: 'image', color: '#ec4899', category: 'image' },
  '.webp': { icon: 'image', color: '#ec4899', category: 'image' },
  '.svg': { icon: 'image', color: '#ec4899', category: 'image' }
};

export function getFileTypeInfo(extension: string) {
  return (
    FILE_TYPE_MAP[extension.toLowerCase()] || {
      icon: 'file',
      color: '#6b7280',
      category: 'unknown'
    }
  );
}
