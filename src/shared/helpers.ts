export function errMsg(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
}
