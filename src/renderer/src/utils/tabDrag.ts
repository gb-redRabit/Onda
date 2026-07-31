let activePath: string | null = null;
let claimed = false;

export function beginTabDrag(path: string): void {
  activePath = path;
  claimed = false;
}

export function claimTabDrag(path: string): void {
  if (activePath !== null && path === activePath) claimed = true;
}

export function getActiveTabDrag(): { path: string; claimed: boolean } | null {
  return activePath === null ? null : { path: activePath, claimed };
}

export function clearTabDrag(): void {
  activePath = null;
  claimed = false;
}
