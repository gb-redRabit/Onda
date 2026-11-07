import { defineComponent } from 'vue';

interface StubOptions {
  props?: string[];
  emits?: string[];
}

/**
 * Minimal component stub used by LibraryView tests for lazily loaded children.
 * Each stub renders a stable data-testid so tests can find and drive it.
 */
export function stub(name: string, options: StubOptions = {}): ReturnType<typeof defineComponent> {
  return defineComponent({
    name,
    props: options.props ?? [],
    emits: options.emits ?? [],
    template: `<div data-testid="${name}" />`
  });
}
