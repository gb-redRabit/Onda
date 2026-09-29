const rules = new Map<string, Intl.PluralRules>();

export type PluralCategory = 'one' | 'few' | 'many';

// vue-i18n's built-in plural handling does not map Polish one/few/many onto a
// 3-form message correctly, so callers pick the form themselves. Intl already
// knows each language's rules (en: one/other, pl: one/few/many).
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
