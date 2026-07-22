# Onda — Development Rules for AI Assistants

This document defines rules for AI models when editing, refactoring, or extending the Onda media player codebase.

---

## 1. Architecture Rules

### 1.1 Module System

- Every view is a module registered in `ModuleManager` (`src/renderer/src/modules/ModuleManager.ts`)
- Modules have lifecycle: `init()` → `activate()` → `deactivate()` → `destroy()`
- `switchTo()` is `async` — always `await` it
- Router `beforeEach` handles module switching (NOT `afterEach`)
- Only `PlayerModule` and `YouTubeModule` need full lifecycle. Other modules can have simple `activate()` only.

### 1.2 Audio/Video Separation

- `audioEngine.ts` (class `AudioEngine`, singleton) manages Web Audio API — NEVER write to Pinia store directly
- `useAudioPlayer.ts` is the bridge: subscribes to `audioEvents` EventBus, syncs to store via `effectScope(true)` + `watch()`
- `PlayerView.vue` + `useVideoPlayer.ts` manages `<video>` element — completely independent state
- `audioEvents.ts` (`AudioEventBus`) is the ONLY communication channel from audio engine to UI
- Audio plays in background during navigation — DO NOT pause audio when switching modules

### 1.3 EventBus Pattern

```typescript
// audioEngine emits:
audioEvents.emit('timeUpdate', currentTime);
audioEvents.emit('durationChange', duration);
audioEvents.emit('playStateChange', isPlaying);
audioEvents.emit('trackEnd');
audioEvents.emit('trackLoaded');

// useAudioPlayer subscribes:
audioEvents.on('timeUpdate', (time) => {
  currentTime.value = time;
});
```

### 1.4 Store Access Rules

- Stores NEVER import composables (prevents circular dependencies)
- Composables can import stores
- `audioEngine` can import stores ONLY for reading (no writes)
- Use `effectScope(true)` + `watch()` for cross-store reactivity (NOT `$subscribe`)

---

## 2. Code Style Rules

### 2.1 TypeScript

- `strict: true` + `noImplicitAny: true` — always
- `noUncheckedIndexedAccess` — always guard array access
- Define interfaces in `src/renderer/src/types/` before using
- `interface` over `type` for object shapes
- `as const` for literal unions
- `unknown` in catch blocks (NOT `any`):
  ```typescript
  catch (e: unknown) {
    const err = e as { message?: string }
    logger.error('tag', 'description', err.message)
  }
  ```
- Avoid `as any` cast — use proper types or `as unknown as T` only when necessary for JASSUB/Electron APIs

### 2.2 Vue 3

- `<script setup lang="ts">` exclusively
- Composition API only (NO Options API)
- Composables in `src/renderer/src/composables/` with `useXxx` naming
- `ref()` for primitive state, `reactive()` only for deeply nested objects
- NEVER use `reactive(new Map())` — use `ref(new Map())` with `triggerRef()` or `Record<K, V>`
- Always provide explicit types for `ref()`:
  ```typescript
  const data = ref<MediaFile | null>(null); // GOOD
  const data = ref(null); // BAD — inferred as never
  ```

### 2.3 Pinia

- Setup stores only: `defineStore('name', () => { ... })`
- Hydrate from electron-store in `load()` (NOT pinia-plugin-persistedstate)
- Debounce `save()` to 300ms
- Return ALL refs and functions explicitly from the store function

### 2.4 CSS

- Tailwind CSS 4 utility-first
- Use CSS variables from theme system (`--color-accent-base`, `--color-bg-base`, etc.)
- NO scoped CSS (exception: page transitions in App.vue)
- Always use `flex-1 min-h-0` for stretching children (NOT `h-full`)
- Layout chain: `flex flex-col h-full` root → `flex flex-1 min-h-0` middle → `flex-1 min-h-0` content

### 2.5 Naming Conventions

- Files: `PascalCase.vue`, `camelCase.ts`, `camelCase.store.ts`
- Composables: `useXxx.ts`
- Stores: `xxx.ts` (not `xxxStore.ts`)
- Types: `PascalCase`, single exports per file
- Constants: `UPPER_SNAKE_CASE`
- Variables/functions: `camelCase`
- Private class fields: `_camelCase` (JS private `#` not used for Electron compatibility)

### 2.6 Imports Order

1. External packages (vue, pinia, etc.)
2. Internal absolute (`@renderer/...`, `@shared/...`)
3. Internal relative (`./...`)
4. Types with `import type { ... }`
5. CSS imports last

---

## 3. Error Handling Rules

### 3.1 Global Error Handler

- `app.config.errorHandler` in `main.ts` catches all Vue errors
- `ErrorBoundary.vue` wraps router-view for component-level error isolation
- Use `flex-1 min-h-0` on ErrorBoundary wrapper (NOT `h-full`)

### 3.2 IPC Safety

- Always use optional chaining: `window.api?.invoke(...)`
- Use `safeInvoke` from `utils/ipc.ts` for ALL IPC calls
- `safeInvoke` returns `null` on failure — always handle null

### 3.3 Race Conditions

- Use `currentLoadId` pattern in `useVideoPlayer.ts`:
  ```typescript
  let currentLoadId = 0;
  async function loadSubtitles(path: string) {
    const loadId = ++currentLoadId;
    const result = await window.api.listEmbeddedSubtitles(path);
    if (loadId !== currentLoadId) return; // cancelled by newer call
  }
  ```

### 3.4 Logger

- Use `logger` from `utils/logger.ts` (renderer) or `main/utils/logger.ts` (main process)
- NEVER use `console.log`/`console.error` directly
- Logger format: `logger.info('tag', 'message', data)`

---

## 4. Performance Rules

### 4.1 Event Loop

- NEVER use `execSync` — always `execAsync` (promisify from `child_process`)
- IPC handlers must be `async` — never block main process
- RAF loop must respect Page Visibility API (pause when `document.hidden`)

### 4.2 State Management

- Debounce all save operations (300ms default)
- Use `shallowRef` for large objects that don't need deep reactivity
- Use `computed` for derived state, NEVER manually sync

### 4.3 Rendering

- Virtualize lists > 100 items (`@tanstack/vue-virtual`)
- Lazy load route components (already done in router)
- Lazy load heavy components (Lucide icons, settings tabs)
- `defineAsyncComponent` for components not visible on initial render

---

## 5. Testing Rules

### 5.1 Test Infrastructure

- Vitest + jsdom + @vue/test-utils
- Test files: `__tests__/*.test.ts` next to source
- `npm test` — run all tests
- `npm run test:watch` — watch mode

### 5.2 Test Coverage

- ALL utility functions must have tests
- Store logic (queue, shuffle, repeat) must have tests
- Composables: test with mocked IPC/dependencies
- IPC handlers: test with mocked electron APIs

### 5.3 Test Patterns

```typescript
import { describe, it, expect } from 'vitest'

describe('functionName', () => {
  it('handles normal case', () => { ... })
  it('handles edge case', () => { ... })
  it('handles null/undefined', () => { ... })
})
```

---

## 6. IPC Communication Rules

### 6.1 Channel Naming

- `domain:action` — e.g. `settings:get`, `media:getCover`, `subtitles:extractEmbedded`
- Main → Renderer (send/on): `domain:event` — e.g. `pip:closed`, `window:maximized`

### 6.2 Type Safety (Future)

```typescript
// Types for ALL IPC channels in types/ipc.ts
interface IpcChannels {
  'settings:get': { args: []; result: Partial<AppSettings> };
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean };
}
```

### 6.3 Error Handling

- IPC handlers catch errors and return error objects (never throw to renderer)
- Renderer uses `safeInvoke` which catches and returns `null`

---

## 7. Git Workflow Rules

- Commit messages: `type(scope): description` — e.g. `feat(player): add speed cycling`
- Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`
- One commit per logical change
- Run `npm run build` BEFORE every commit
- Run `npm test` BEFORE every commit
- NEVER commit with typecheck errors

---

## 8. File Organization Rules

### 8.1 Adding New Features

- Types first: define interfaces in `types/`
- Store: if feature needs global state, add store
- Composables: extract reusable logic from views
- Components: build UI from smallest composable pieces
- Module: if feature is a new view, create module in `modules/`

### 8.2 File Sizes

- MAX 400 lines per file (exception: handlers.ts is inherently large)
- Vue components: MAX 300 lines
- Composables: MAX 200 lines
- Stores: MAX 200 lines
- Break large files into smaller modules

### 8.3 Shared Code

- Cross-process constants → `src/shared/constants.ts` (alias `@shared`)
- IPC types → `src/renderer/src/types/`
- Main process utilities → `src/main/utils/`
- Font files → `src/renderer/public/fonts/`

---

## 9. Electron-Specific Rules

- `electron-store` import: always use dynamic import (ESM/CJS workaround)
- Never access `BrowserWindow` without guard: `if (!win) return`
- Store `mainWindow` reference centrally, pass via `setMainWindow()`
- JASSUB wasm must be served as `data:` URL (MIME workaround)
- Use `webUtils.getPathForFile` for drag-and-drop file paths
- PiP uses separate `BrowserWindow` with dedicated preload

---

## 10. Design Principles

1. **Separation of concerns** — audio engine ≠ UI ≠ store
2. **Fail gracefully** — catch all errors, never crash the app
3. **Progressive enhancement** — core features work offline, extras need internet
4. **Event-driven communication** — EventBus, not direct callbacks
5. **Type safety first** — strict TS, no `any`, interface-driven
6. **Small modules** — MAX 400 lines, single responsibility
7. **Testable by design** — dependency injection, no global state

---

_Ostatnia aktualizacja: 2026-07-20_
