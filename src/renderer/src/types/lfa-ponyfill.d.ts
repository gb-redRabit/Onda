declare module 'lfa-ponyfill' {
  export function queryLocalFonts(): Promise<
    Array<{ family: string; fullName: string; postscriptName: string }>
  >;

  export function queryRemoteFonts(opts: { postscriptNames?: string[]; family?: string }): Promise<
    Array<{
      url: string;
      family: string;
      style: string;
      weight: number;
      format: string;
      blob: () => Promise<Blob>;
    }>
  >;
}
