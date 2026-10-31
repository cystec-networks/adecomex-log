import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFArray, decodePDFRawStream } from "@cantoo/pdf-lib";
import jpeg from "jpeg-js";
import { decode as decodePng, encode as encodePng } from "fast-png";

export const DPI_DOCUMENTO = 200;
const CALIDAD_JPEG = 92;
const MAX_PIXELES = 16_000_000;
const MAX_BYTES = 20 * 1024 * 1024;
type Motivo = "optimizado" | "firmado" | "sin_ahorro" | "no_admitido" | "fallo" | "lectura";
export type OptimizacionDocumento = { bytes: Uint8Array; original: Uint8Array; motivo: Motivo; ahorro: number };
const nombre = (s: string) => PDFName.of(s);

/** Never rewrite even empty signature fields, certification/usage rights or encrypted inputs. */
export async function pdfProtegido(bytes: Uint8Array): Promise<boolean> {
  const raw = new TextDecoder("latin1").decode(bytes);
  if (/\/(?:ByteRange|DocMDP|Sig|Perms|Encrypt)\b/.test(raw)) return true;
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  if (pdf.isEncrypted) return true;
  return pdf.context.enumerateIndirectObjects().some(([, obj]) => obj instanceof PDFDict &&
    (obj.has(nombre("ByteRange")) || obj.get(nombre("FT"))?.toString() === "/Sig" || obj.get(nombre("Type"))?.toString() === "/Sig"));
}

/** Area averaging (not nearest-neighbour): preserves fine strokes and never upscales. */
export function reducirImagen(data: Uint8Array, width: number, height: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const sx = width / w, sy = height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const left = x * sx, right = (x + 1) * sx, top = y * sy, bottom = (y + 1) * sy;
    const sums = [0, 0, 0, 0]; let weight = 0;
    for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy++) for (let ix = Math.floor(left); ix < Math.ceil(right); ix++) {
      const a = (Math.min(right, ix + 1) - Math.max(left, ix)) * (Math.min(bottom, iy + 1) - Math.max(top, iy));
      const p = (iy * width + ix) * 4;
      for (let c = 0; c < 4; c++) sums[c] += data[p + c] * a;
      weight += a;
    }
    for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = Math.round(sums[c] / weight);
  }
  return out;
}

export function dimensiones200Dpi(width: number, height: number, anchoPuntos: number, altoPuntos: number) {
  const scale = Math.min(1, anchoPuntos / 72 * DPI_DOCUMENTO / width, altoPuntos / 72 * DPI_DOCUMENTO / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function jpegSeguro(bytes: Uint8Array) {
  // Only ordinary 8-bit RGB/YCbCr JPEGs. Skip CMYK, ICC and EXIF orientation rather than change colors/rotation.
  for (let i = 2; i + 8 < bytes.length;) {
    if (bytes[i] !== 255) return false;
    const marker = bytes[i + 1];
    if (marker === 0xda) break;
    const len = bytes[i + 2] * 256 + bytes[i + 3];
    if (len < 2) return false;
    if (marker === 0xe1 || marker === 0xe2) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return bytes[i + 4] === 8 && bytes[i + 9] === 3;
    i += 2 + len;
  }
  return false;
}

function codificarJpeg(bytes: Uint8Array, w: number, h: number) {
  if (!jpegSeguro(bytes)) return null;
  const image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 160, tolerantDecoding: false });
  if (w >= image.width || h >= image.height) return null;
  const rgba = reducirImagen(image.data, image.width, image.height, w, h);
  const encoded = new Uint8Array(jpeg.encode({ data: rgba, width: w, height: h }, CALIDAD_JPEG).data);
  // Verify the codec roundtrip. Excessive visual deviation automatically rejects the candidate.
  const check = jpeg.decode(encoded, { useTArray: true });
  let error = 0;
  for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) error += (rgba[i + c] - check.data[i + c]) ** 2;
  if (check.width !== w || check.height !== h || error / (w * h * 3) > 36) return null;
  return encoded.length < bytes.length ? encoded : null;
}

function colocacionesImagen(text: string): Map<string, { width: number; height: number }> | null {
  const tokens = text.replace(/%[^\r\n]*/g, "").trim().split(/\s+/);
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [], args: string[] = [];
  const result = new Map<string, { width: number; height: number }>();
  for (const token of tokens) {
    if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || /^\/[A-Za-z0-9_-]+$/.test(token)) { args.push(token); continue; }
    if (token === "q" && !args.length) { stack.push([...matrix]); continue; }
    if (token === "Q" && !args.length) { const old = stack.pop(); if (!old) return null; matrix = old; continue; }
    if (token === "cm" && args.length === 6) {
      const [a,b,c,d,e,f] = args.map(Number), [A,B,C,D,E,F] = matrix;
      matrix = [A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];
      args.length = 0; continue;
    }
    if (token === "Do" && args.length === 1 && args[0].startsWith("/")) {
      const [a,b,c,d] = matrix;
      if (b !== 0 || c !== 0 || a <= 0 || d <= 0) return null;
      const key = args[0], old = result.get(key);
      result.set(key, { width: Math.max(old?.width ?? 0, a), height: Math.max(old?.height ?? 0, d) });
      args.length = 0; continue;
    }
    return null; // Text, clipping, patterns, inline images and unknown operators: never guess.
  }
  return args.length || stack.length ? null : result;
}

/** Only an unambiguous image-only page is resized. Complex graphics, masks, forms and text stay untouched. */
async function optimizarPdf(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (await pdfProtegido(bytes)) return null;
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const plans = new Map<PDFRawStream, { width: number; height: number }>();
  const blocked = new Set<PDFRawStream>();
  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    const xobjects = resources?.lookupMaybe(nombre("XObject"), PDFDict);
    if (!xobjects) continue;
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    let text = "";
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) { text = "unsupported"; break; }
      text += new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode()) + "\n";
    }
    const placements = colocacionesImagen(text);
    for (const [key, ref] of xobjects.entries()) {
      const image = pdf.context.lookup(ref);
      if (!(image instanceof PDFRawStream) || image.dict.get(nombre("Subtype"))?.toString() !== "/Image") continue;
      const placement = placements?.get(key.toString());
      if (!placement) { blocked.add(image); continue; }
      const d = image.dict;
      if (d.get(nombre("Filter"))?.toString() !== "/DCTDecode" || d.get(nombre("ColorSpace"))?.toString() !== "/DeviceRGB" || ["SMask", "Mask", "Decode", "DecodeParms", "ImageMask"].some((k) => d.has(nombre(k)))) continue;
      const w = d.lookup(nombre("Width"), PDFNumber).asNumber(), h = d.lookup(nombre("Height"), PDFNumber).asNumber();
      if (w * h > MAX_PIXELES || w * 72 / placement.width <= 220 || h * 72 / placement.height <= 220) continue;
      const target = dimensiones200Dpi(w, h, placement.width, placement.height);
      const old = plans.get(image);
      plans.set(image, { width: Math.max(old?.width ?? 0, target.width), height: Math.max(old?.height ?? 0, target.height) });
    }
  }
  for (const [image, target] of plans) {
    if (blocked.has(image)) continue;
    const optimized = codificarJpeg(image.contents, target.width, target.height);
    if (!optimized) continue;
    image.updateContents(optimized);
    image.dict.set(nombre("Width"), PDFNumber.of(target.width));
    image.dict.set(nombre("Height"), PDFNumber.of(target.height));
  }
  // No page copying/rasterization: bookmarks, links, text, annotations and page geometry are retained.
  pdf.context.trailerInfo.Info = undefined;
  pdf.catalog.delete(nombre("Metadata"));
  const out = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  if (out.length >= bytes.length) return bytes;
  const check = await PDFDocument.load(out, { updateMetadata: false });
  if (check.getPageCount() !== pdf.getPageCount()) throw new Error("Páginas distintas");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const a = await getDocumentProxy(bytes.slice()), b = await getDocumentProxy(out.slice());
  try {
    const original = await extractText(a, { mergePages: false });
    const candidate = await extractText(b, { mergePages: false });
    if (JSON.stringify(original.text) !== JSON.stringify(candidate.text)) throw new Error("Texto distinto");
  } finally { await a.cleanup(); await b.cleanup(); }
  return out;
}

/** Returns original bytes on any uncertainty, failure, lost text, signatures or absent savings. */
export async function optimizarDocumento(bytes: Uint8Array, mime: string): Promise<OptimizacionDocumento> {
  const base = (motivo: Motivo): OptimizacionDocumento => ({ bytes, original: bytes, motivo, ahorro: 0 });
  if (!bytes.length || bytes.length > MAX_BYTES) return base("no_admitido");
  try {
    let candidate: Uint8Array | null = null;
    if (mime === "application/pdf") {
      if (await pdfProtegido(bytes)) return base("firmado");
      candidate = await optimizarPdf(bytes);
    } else if (mime === "image/png") {
      const png = decodePng(bytes);
      if (png.width * png.height > MAX_PIXELES || png.iccEmbeddedProfile || png.palette || png.transparency || png.depth !== 8) return base("no_admitido");
      // Lossless PNG re-encoding removes text metadata; do not guess physical DPI or discard transparency.
      candidate = encodePng({ width: png.width, height: png.height, channels: png.channels, depth: png.depth, data: png.data });
    } else if (mime === "image/jpeg") {
      // JFIF declares physical density; without it we never guess an image's physical paper size.
      if (!jpegSeguro(bytes) || new TextDecoder().decode(bytes.subarray(6, 11)) !== "JFIF\0") return base("no_admitido");
      const unit = bytes[13], factor = unit === 1 ? 1 : unit === 2 ? 2.54 : 0;
      const dx = (bytes[14] * 256 + bytes[15]) * factor, dy = (bytes[16] * 256 + bytes[17]) * factor;
      if (dx <= 220 || dy <= 220) return base("sin_ahorro");
      const img = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 160 });
      candidate = codificarJpeg(bytes, Math.round(img.width * DPI_DOCUMENTO / dx), Math.round(img.height * DPI_DOCUMENTO / dy));
    } else return base("no_admitido");
    if (!candidate || candidate.length >= bytes.length) return base("sin_ahorro");
    return { bytes: candidate, original: bytes, motivo: "optimizado", ahorro: bytes.length - candidate.length };
  } catch { return base("fallo"); }
}

/** File name/MIME and the source hash remain stable; every caller reads the same bytes it stores. */
export async function optimizarArchivo(file: File): Promise<File> {
  const mime = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "");
  const result = await optimizarDocumento(new Uint8Array(await file.arrayBuffer()), mime);
  return result.ahorro ? new File([result.bytes as BlobPart], file.name, { type: mime, lastModified: file.lastModified }) : file;
}