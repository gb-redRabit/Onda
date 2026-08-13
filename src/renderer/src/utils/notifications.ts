// Native system notifications (HTML5 Notification API). Fall back silently
// when unavailable or permission is denied.
export function notifyNative(title: string, body?: string): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
    } else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title, { body });
      });
    }
  } catch {
    /* notifications unavailable */
  }
}
