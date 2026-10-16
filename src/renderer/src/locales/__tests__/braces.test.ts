import { describe, expect, it } from 'vitest';
import en from '../en';
import pl from '../pl';

// Guard na nawiasy w komunikatach. Komunikaty-tablice (poradnik wtyczek) są czytane
// przez `tm()`, które zwraca surowy tekst BEZ interpolacji, więc próbki kodu mogą
// zawierać zbalansowane `{...}`. Niezbalansowany nawias to jednak prawie zawsze błąd
// tłumacza (urwał się literalny `{`), który wywala interpolację vue-i18n.

function offenders(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    const opens = (value.match(/\{/g) || []).length;
    const closes = (value.match(/\}/g) || []).length;
    if (opens !== closes) out.push(`${path}: ${JSON.stringify(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => offenders(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) offenders(v, path ? `${path}.${k}` : k, out);
  }
}

describe('locale interpolation braces', () => {
  it('has no unbalanced braces in en or pl', () => {
    const out: string[] = [];
    offenders(en, '', out);
    offenders(pl, '', out);
    expect(out).toEqual([]);
  });
});
