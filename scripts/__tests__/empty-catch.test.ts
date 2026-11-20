import { describe, expect, it } from 'vitest';
import { findEmptyCatches } from '../lib/empty-catch.mjs';

describe('findEmptyCatches', () => {
  it('flags empty catch blocks with and without a binding', () => {
    const source = 'try {} catch {}\ntry {} catch (error) {}';

    expect(findEmptyCatches(source).map((found) => found.kind)).toEqual(['catch {}', 'catch {}']);
  });

  it('flags empty promise catches with and without a binding', () => {
    const source = 'run().catch(() => {});\nrun().catch((error) => {});';

    expect(findEmptyCatches(source).map((found) => found.kind)).toEqual([
      '.catch(() => {})',
      '.catch(() => {})'
    ]);
  });

  it('allows a comment or code inside the block', () => {
    const source = [
      'try {} catch { /* best effort */ }',
      'try {} catch (error) { logger.warn(error); }',
      'run().catch(() => { /* ignore */ });'
    ].join('\n');

    expect(findEmptyCatches(source)).toEqual([]);
  });

  it('sees through multiline whitespace', () => {
    const source = 'try {} catch {\n}\nrun().catch(() => {\n  });';

    expect(findEmptyCatches(source)).toHaveLength(2);
  });

  it('reports positions in source order', () => {
    const source = 'run().catch(() => {});\ntry {} catch {}';
    const [first, second] = findEmptyCatches(source);

    expect(first.kind).toBe('.catch(() => {})');
    expect(second.kind).toBe('catch {}');
    expect(first.index).toBeLessThan(second.index);
  });
});
