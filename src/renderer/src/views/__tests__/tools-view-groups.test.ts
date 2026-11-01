import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolId } from '@shared/types/tools';

// Siedem kart narzędzi było jedną płaską siatką. Grupowanie po rodzaju materiału
// łatwo zgubić przy dodawaniu kolejnego narzędzia, więc pilnujemy, że każda karta
// występuje dokładnie raz i że sekcje faktycznie się renderują.

const VIEW = join(process.cwd(), 'src/renderer/src/views/ToolsView.vue');
const source = readFileSync(VIEW, 'utf8');

const TOOL_IDS: ToolId[] = [
  'converter',
  'tag-editor',
  'history-export',
  'video-clipper',
  'video-concat',
  'image-studio',
  'batch-images'
];

describe('tools hub grouping', () => {
  it('renders one labelled section per tool group', () => {
    expect(source).toMatch(/v-for="group in groups"/);
    expect(source).toMatch(/data-testid="`tools-group-\$\{group\.id\}`"/);
    expect(source).toMatch(/aria-labelledby="`tools-group-\$\{group\.id\}-label`"/);
  });

  it('lists every tool exactly once across the groups', () => {
    for (const id of TOOL_IDS) {
      const occurrences = source.match(new RegExp(`id: '${id}'`, 'g')) ?? [];
      expect(occurrences, id).toHaveLength(1);
    }
  });
});
