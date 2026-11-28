declare module 'culori' {
  export type Color = { mode: string } & Record<string, number | string | undefined>

  export function parse(color: string): Color | undefined

  export function formatHex(color: string | Color): string | undefined

  export function differenceCiede2000(
    Kl?: number,
    Kc?: number,
    Kh?: number,
  ): (standard: string | Color, sample: string | Color) => number
}
