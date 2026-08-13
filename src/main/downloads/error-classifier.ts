import type { IpcDownloadErrorCode } from '../../shared/types/ipc';

// Classifies yt-dlp stderr into a stable, user-facing error category. The order
// of the checks matters: the most specific conditions (private, bot-block,
// not-found) are matched before the broad "sign in" / "login" pattern so a
// private or removed video is never reported as a generic auth problem.
export function classifyYtDlpError(stderr: string): IpcDownloadErrorCode {
  const s = stderr.toLowerCase();

  if (/(this video is private|video is private|private video)/.test(s)) {
    return 'private';
  }
  if (/(bot|recaptcha|captcha|http error 429|too many requests|automated traffic|unusual traffic)/.test(s)) {
    return 'bot-block';
  }
  if (
    /(video unavailable|this video is not available|no longer available|does not exist|http error 404|not available in your country|requested format is not available)/.test(
      s
    )
  ) {
    return 'not-found';
  }
  if (
    /(sign in|log in|login required|age[- ]?restricted|confirm your age|members[- ]?only|membership|requires authentication|join this channel|this content isn't available)/.test(
      s
    )
  ) {
    return 'auth-required';
  }
  if (/(ffmpeg|ffprobe|avconv|avprobe)/.test(s)) {
    return 'dependency';
  }
  if (
    /(proxy)/.test(s)
  ) {
    return 'proxy';
  }
  if (
    /(network|timeout|timed out|unable to download|connection|ssl|resolve host|getaddrinfo|econnreset|econnrefused|etimedout|no route to host)/.test(
      s
    )
  ) {
    return 'network';
  }
  return 'unknown';
}

// Short English fallback for each category. The renderer translates these via
// i18n; this is only used when the renderer has no translation available or a
// raw message is needed outside the UI.
export function describeError(code: IpcDownloadErrorCode): string {
  switch (code) {
    case 'auth-required':
      return 'Sign-in required — log in to YouTube to download this content';
    case 'bot-block':
      return 'Blocked by bot protection — try signing in or waiting and retrying';
    case 'private':
      return 'This video is private';
    case 'not-found':
      return 'Video not found or unavailable';
    case 'network':
      return 'Network error while downloading';
    case 'proxy':
      return 'Proxy error — check your proxy settings';
    case 'dependency':
      return 'Missing dependency (FFmpeg/FFprobe)';
    default:
      return 'Download failed';
  }
}

// Strips secrets (cookie file paths, cookies, tokens, passwords) from yt-dlp
// stderr before it is stored or shown, so diagnostics never leak a session.
export function redactSecrets(text: string): string {
  return text
    .replace(/--cookies(?:-from-browser)?\s+\S+/g, '--cookies [REDACTED]')
    .replace(/(\b(?:cookie|password|token|auth|authorization)\s*[=:]\s*)\S+/gi, '$1[REDACTED]');
}
