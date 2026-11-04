import { describe, expect, it } from 'vitest';
import {
  filesForTool,
  isToolAvailableForFiles,
  toolContextPaths,
  toolsForFiles
} from '../tool-input';

describe('tool input matching', () => {
  it('offers both image tools for one image', () => {
    expect(toolsForFiles(['/media/photo.png'])).toEqual(['image-studio', 'batch-images']);
  });

  it('does not offer a single-file tool for a multi-file selection', () => {
    expect(isToolAvailableForFiles('image-studio', ['/media/a.png', '/media/b.png'])).toBe(false);
    expect(isToolAvailableForFiles('batch-images', ['/media/a.png', '/media/b.png'])).toBe(true);
  });

  it('uses each tool extension list, not just the media kind', () => {
    expect(toolsForFiles(['/media/song.mp3'])).toContain('tag-editor');
    // ALAC jest audio, ale edytor tagów go nie obsługuje.
    expect(toolsForFiles(['/media/song.alac'])).not.toContain('tag-editor');
  });

  it('rejects mixed audio and video for the converter', () => {
    expect(isToolAvailableForFiles('converter', ['/media/song.mp3', '/media/clip.mp4'])).toBe(
      false
    );
    expect(isToolAvailableForFiles('converter', ['/media/a.mp3', '/media/b.flac'])).toBe(true);
    expect(isToolAvailableForFiles('converter', ['/media/a.mp4', '/media/b.mkv'])).toBe(true);
  });

  it('offers the clipper and concat only for supported video', () => {
    expect(toolsForFiles(['/media/clip.mp4'])).toEqual(
      expect.arrayContaining(['video-clipper', 'video-concat'])
    );
    expect(toolsForFiles(['/media/song.mp3'])).not.toContain('video-clipper');
  });

  it('drops unsupported files and keeps order without duplicates', () => {
    expect(
      filesForTool('tag-editor', ['/a/b.mp3', '/a/notes.txt', '/a/b.mp3', '/a/c.flac'])
    ).toEqual(['/a/b.mp3', '/a/c.flac']);
  });

  it('reads paths from either a paths array or a single path param', () => {
    expect(
      toolContextPaths({ toolId: 'tag-editor', params: { paths: ['/a.mp3', '', 3, '/b.mp3'] } })
    ).toEqual(['/a.mp3', '/b.mp3']);
    expect(toolContextPaths({ toolId: 'image-studio', params: { path: '/a.png' } })).toEqual([
      '/a.png'
    ]);
    expect(toolContextPaths(null)).toEqual([]);
  });
});
