// Maps a classified error code to its i18n key (used by the downloads list and
// the YouTube search/resolve/channel views). Returns '' when the code is unknown.
export function errorCodeKey(code?: string): string {
  switch (code) {
    case 'auth-required':
      return 'downloads.errorAuthRequired';
    case 'bot-block':
      return 'downloads.errorBotBlock';
    case 'private':
      return 'downloads.errorPrivate';
    case 'not-found':
      return 'downloads.errorNotFound';
    case 'network':
      return 'downloads.errorNetwork';
    case 'proxy':
      return 'downloads.errorProxy';
    case 'dependency':
      return 'downloads.errorDependency';
    default:
      return '';
  }
}
