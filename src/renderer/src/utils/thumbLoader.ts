export const thumbTasks: (() => void)[] = [];
export let thumbActive = 0;
export const THUMB_MAX = 3;
export const thumbCache = new Map<string, string>();
export const iconCache = new Map<string, string>();

export function processThumbQueue() {
  while (thumbActive < THUMB_MAX && thumbTasks.length > 0) {
    const task = thumbTasks.shift()!;
    thumbActive++;
    task();
  }
}

export function thumbTaskDone(): void {
  thumbActive--;
  processThumbQueue();
}
