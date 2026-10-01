// Natywne powiadomienia systemowe (HTML5 Notification API). Ciche wycofanie,
// gdy niedostępne lub odmówiono pozwolenia.
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
    /* powiadomienia niedostępne */
  }
}
