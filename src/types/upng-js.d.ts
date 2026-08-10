declare module "upng-js" {
  /** Encode frames (RGBA ArrayBuffers, w*h*4 each) to (A)PNG. cnum 0 = lossless; dels = per-frame ms. */
  export function encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[]): ArrayBuffer;
  export function decode(buffer: ArrayBuffer): unknown;
  const UPNG: { encode: typeof encode; decode: typeof decode };
  export default UPNG;
}
