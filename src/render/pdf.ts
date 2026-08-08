import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { viewBoxOf } from "../svg/util.js";

/**
 * Vector PDF export for print/handoff. Input SVGs must be flat (paths + groups,
 * no nested <svg> or <style>) — the marks and the flattened lockups qualify.
 * No fonts are needed because glyphs are already outlined.
 */
export function svgToPdf(svg: string): Promise<Buffer> {
  const parts = viewBoxOf(svg).split(/\s+/).map(Number);
  const width = parts[2] || 100;
  const height = parts[3] || 100;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    SVGtoPDF(doc, svg, 0, 0, { width, height, assumePt: true });
    doc.end();
  });
}
