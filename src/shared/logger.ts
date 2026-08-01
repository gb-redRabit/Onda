export const logger = {
  info: (tag: string, msg: string, ...args: unknown[]) =>
    console.log(`[Onda/${tag}]`, msg, ...args),
  error: (tag: string, msg: string, ...args: unknown[]) =>
    console.error(`[Onda/${tag}]`, msg, ...args),
  warn: (tag: string, msg: string, ...args: unknown[]) =>
    console.warn(`[Onda/${tag}]`, msg, ...args)
};
