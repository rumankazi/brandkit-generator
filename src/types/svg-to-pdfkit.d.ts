declare module "svg-to-pdfkit" {
  export default function SVGtoPDF(
    doc: unknown,
    svg: string,
    x?: number,
    y?: number,
    options?: Record<string, unknown>,
  ): void;
}
