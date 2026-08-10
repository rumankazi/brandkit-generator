import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { viewBoxOf } from "../svg/util.js";

/**
 * Vector PDF export for print/handoff. Input SVGs must be flat (paths + groups,
 * no nested <svg> or <style>) — the marks and the flattened lockups qualify.
 * No fonts are needed because glyphs are already outlined.
 */
// Pinned metadata → byte-identical PDFs across runs (pdfkit otherwise stamps a
// live CreationDate and derives the file /ID from it).
const PDF_INFO = { CreationDate: new Date(0), Producer: "brandkit-generator", Creator: "brandkit-generator" };

function render(widthPt: number, heightPt: number, svg: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [widthPt, heightPt], margin: 0, info: PDF_INFO });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    SVGtoPDF(doc, svg, 0, 0, { width: widthPt, height: heightPt, assumePt: true });
    doc.end();
  });
}

/** PDF sized from the SVG's viewBox (units treated as points). */
export function svgToPdf(svg: string): Promise<Buffer> {
  const parts = viewBoxOf(svg).split(/\s+/).map(Number);
  return render(parts[2] || 100, parts[3] || 100, svg);
}

/** Physically-sized print PDF embedding a raster image (for stickers, whose
 * white contour uses an SVG filter that vector PDF renderers don't support). */
export function pngToPdfMm(png: Buffer, wMm: number, hMm: number): Promise<Buffer> {
  const mmToPt = (mm: number) => (mm / 25.4) * 72;
  const wpt = mmToPt(wMm);
  const hpt = mmToPt(hMm);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [wpt, hpt], margin: 0, info: PDF_INFO });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.image(png, 0, 0, { width: wpt, height: hpt });
    doc.end();
  });
}
