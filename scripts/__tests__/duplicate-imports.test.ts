import { describe, expect, it } from 'vitest';
import { duplicateSpecifiers } from '../lib/duplicate-imports.mjs';

describe('duplicateSpecifiers', () => {
  it('flags two value imports from the same module', () => {
    const source = "import { a } from './x';\nimport { b } from './x';";

    expect(duplicateSpecifiers(source)).toEqual(['value ./x']);
  });

  it('flags duplicate type imports separately', () => {
    const source = "import type { A } from './x';\nimport type { B } from './x';";

    expect(duplicateSpecifiers(source)).toEqual(['type ./x']);
  });

  it('keeps value and type imports from the same module apart', () => {
    const source = "import { a } from './x';\nimport type { B } from './x';";

    expect(duplicateSpecifiers(source)).toEqual([]);
  });

  it('handles multiline imports and double quotes', () => {
    const source = 'import {\n  a,\n  b\n} from "./x";\nimport { c } from "./x";';

    expect(duplicateSpecifiers(source)).toEqual(['value ./x']);
  });

  it('detects duplicate side-effect imports', () => {
    const source = "import './polyfill';\nimport './polyfill';";

    expect(duplicateSpecifiers(source)).toEqual(['value ./polyfill']);
  });

  it('ignores import.meta and dynamic import()', () => {
    const source = [
      'const url = import.meta.url;',
      "const first = await import('./x');",
      "const second = await import('./x');"
    ].join('\n');

    expect(duplicateSpecifiers(source)).toEqual([]);
  });

  it('allows leading indentation', () => {
    const source = "  import { a } from './x';\n  import { b } from './x';";

    expect(duplicateSpecifiers(source)).toEqual(['value ./x']);
  });

  it('reports only repeated specifiers', () => {
    const source = "import { a } from './x';\nimport { b } from './y';\nimport { c } from './x';";

    expect(duplicateSpecifiers(source)).toEqual(['value ./x']);
  });
});
