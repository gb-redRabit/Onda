// Mapuje sklasyfikowany kod błędu na jego klucz i18n (używany przez listę pobierań i
// widoki wyszukiwania/rozwiązywania/kanału YouTube). Zwraca '' gdy kod jest nieznany.
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
    case 'unsupported':
      return 'downloads.errorUnsupported';
    case 'disk-full':
      return 'downloads.errorDiskFull';
    default:
      return '';
  }
}
