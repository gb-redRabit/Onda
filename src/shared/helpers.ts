export function errMsg(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
}

export function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}
