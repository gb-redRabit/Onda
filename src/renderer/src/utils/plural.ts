const rules = new Map<string, Intl.PluralRules>();

export type PluralCategory = 'one' | 'few' | 'many';

// Wbudowana obsługa liczby mnogiej vue-i18n nie mapuje polskiego one/few/many na
// 3-formową wiadomość poprawnie, więc wywołujący sami wybierają formę. Intl już
// zna reguły każdego języka (en: one/other, pl: one/few/many).
export function pluralCategory(locale: string, count: number): PluralCategory {
  const language = locale.split('-')[0] || 'en';
  let rule = rules.get(language);
  if (!rule) {
    rule = new Intl.PluralRules(language);
    rules.set(language, rule);
  }
  const category = rule.select(count);
  if (category === 'one') return 'one';
  if (category === 'few') return 'few';
  return 'many';
}
