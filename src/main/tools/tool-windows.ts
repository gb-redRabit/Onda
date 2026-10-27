import { BrowserWindow, type WebContents } from 'electron';
import { logger } from '../../shared/logger';
import {
  TOOL_DEFINITIONS,
  TOOL_IDS,
  type ToolId,
  type ToolMessage,
  type ToolMessageInput,
  type ToolWindowContext
} from '../../shared/types/tools';
import { createWindow } from '../windows/window-factory';
import { GLASS_WINDOW_OPTS } from '../windows/window-presets';

const windows = new Map<ToolId, BrowserWindow>();
const contexts = new Map<number, ToolWindowContext>();

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}

function normalizeParams(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function bringToFront(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.moveTop();
}

export function openToolWindow(
  toolId: ToolId,
  params?: unknown,
  mainWindow?: BrowserWindow | null
): number | null {
  const definition = TOOL_DEFINITIONS[toolId];
  if (!definition) return null;

  const existing = windows.get(toolId);
  if (existing && !existing.isDestroyed()) {
    const safeParams = normalizeParams(params);
    if (safeParams) contexts.set(existing.id, { toolId, params: safeParams });
    bringToFront(existing);
    return existing.id;
  }

  try {
    const win = createWindow({
      width: definition.width,
      height: definition.height,
      minWidth: definition.minWidth,
      minHeight: definition.minHeight,
      show: false,
      // Okno narzędzia jest własnością głównego okna, więc zawsze rysuje się
      // nad aplikacją, także gdy główne okno jest przypięte (always-on-top).
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      ...GLASS_WINDOW_OPTS,
      title: definition.title,
      hash: definition.route,
      onReadyToShow: (ready) => {
        bringToFront(ready);
        // Krótki boost na wierzch pokrywa przypadki, w których Windows nie
        // podnosi nowego okna mimo focus() (np. main właśnie miał focus).
        ready.setAlwaysOnTop(true);
        setTimeout(() => {
          if (!ready.isDestroyed()) ready.setAlwaysOnTop(false);
        }, 250);
      },
      onClosed: (closed) => {
        windows.delete(toolId);
        contexts.delete(closed.id);
      }
    });
    const id = win.id;
    windows.set(toolId, win);
    contexts.set(id, { toolId, params: normalizeParams(params) ?? {} });
    win.setMenuBarVisibility(false);
    return id;
  } catch (error) {
    logger.warn('tools', `openToolWindow '${toolId}' failed`, error);
    return null;
  }
}

export function getToolWindowContext(sender: WebContents): ToolWindowContext | null {
  const win = BrowserWindow.fromWebContents(sender);
  if (!win) return null;
  return contexts.get(win.id) ?? null;
}

export function sendToolMessageToMain(
  sender: WebContents,
  input: unknown,
  mainWindow: BrowserWindow | null
): boolean {
  const context = getToolWindowContext(sender);
  if (!context) return false;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;

  const message = input as Partial<ToolMessageInput>;
  if (typeof message.type !== 'string' || !message.type || message.type.length > 100) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const payload: ToolMessage = {
    toolId: context.toolId,
    type: message.type,
    ...(message.payload === undefined ? {} : { payload: message.payload })
  };
  mainWindow.webContents.send('tools:message', payload);
  return true;
}

export function getToolWindows(): BrowserWindow[] {
  return [...windows.values()].filter((win) => !win.isDestroyed());
}
