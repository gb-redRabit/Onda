import type { IpcDownloadErrorCode } from '../../shared/types/ipc';

// Klasyfikuje stderr yt-dlp do stabilnej, widocznej dla użytkownika kategorii błędu.
// Kolejność sprawdzeń ma znaczenie: najbardziej szczegółowe warunki (private,
// bot-block, not-found) są dopasowywane przed szerokim wzorcem "sign in" / "login",
// aby prywatne lub usunięte wideo nigdy nie było zgłaszane jako ogólny problem auth.
export function classifyYtDlpError(stderr: string): IpcDownloadErrorCode {
  const s = stderr.toLowerCase();

  if (/(this video is private|video is private|private video)/.test(s)) {
    return 'private';
  }
  if (
    /(bot|recaptcha|captcha|http error 429|too many requests|automated traffic|unusual traffic)/.test(
      s
    )
  ) {
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
  if (/(enospc|no space left|not enough space|disk full|disk is full)/.test(s)) {
    return 'disk-full';
  }
  if (/(proxy)/.test(s)) {
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

// Krótki angielski fallback dla każdej kategorii. Renderer tłumaczy je przez
// i18n; używane tylko wtedy, gdy renderer nie ma dostępnego tłumaczenia lub
// surowy komunikat jest potrzebny poza UI.
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
    case 'disk-full':
      return 'Not enough disk space — free up space and retry';
    default:
      return 'Download failed';
  }
}

// Usuwa sekrety (ścieżki plików cookies, cookies, tokeny, hasła) ze stderr
// yt-dlp, zanim zostanie zapisany lub pokazany. Wspólna implementacja, aby logi i
// zapisane błędy redagowały w ten sam sposób.
export { redactSecrets } from '../../shared/redact';
