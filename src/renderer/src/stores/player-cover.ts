import { VIDEO_EXTS } from '@shared/constants';

export interface CoverResult {
  type: 'video' | 'image' | null;
  data: string | null;
}

export function captureVideoFrame(filePath: string): Promise<CoverResult> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) return Promise.resolve({ type: null, data: null });

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = `${window.api.mediaServerUrl}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;

    let resolved = false;
    function done(result: CoverResult) {
      if (resolved) return;
      resolved = true;
      video.remove();
      resolve(result);
    }

    const timer = setTimeout(() => done({ type: null, data: null }), 15000);

    video.onloadedmetadata = () => {
      const t = Math.min(1, video.duration || 1);
      video.currentTime = t > 0 ? t : 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done({ type: null, data: null });
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        done({ type: 'image', data: dataUrl });
      } catch {
        done({ type: null, data: null });
      }
    };

    video.onerror = () => {
      clearTimeout(timer);
      done({ type: null, data: null });
    };
    video.onabort = () => {
      clearTimeout(timer);
      done({ type: null, data: null });
    };
  });
}
