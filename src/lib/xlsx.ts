/**
 * Generador minimo de archivos .xlsx, sin dependencias.
 *
 * Un .xlsx es un ZIP (metodo STORE, sin comprimir: Excel lo acepta) con unas pocas
 * partes XML. Se escribe a mano en vez de traer SheetJS/exceljs porque la app solo
 * *genera* hojas con datos propios y de confianza; no lee archivos ajenos. Meter una
 * libreria de parseo (con sus CVE en la ruta de lectura) para eso rompe la regla de
 * dependencias minimas del proyecto.
 *
 * Cubre lo que la factura necesita: texto y numeros, unos estilos fijos (titulo,
 * encabezado, moneda), anchos de columna y celdas combinadas. Nada mas.
 */

export type CellStyle =
  | "title"
  | "subtitle"
  | "label"
  | "header"
  | "money"
  | "moneyBold"
  | "muted";

export type Cell =
  | null
  | string
  | number
  | { text: string; style?: CellStyle }
  | { number: number; style?: CellStyle };

export interface SheetSpec {
  /** Nombre de la pestana. Excel lo corta a 31 caracteres. */
  sheetName: string;
  /** Ancho de cada columna en "caracteres". */
  colWidths: number[];
  rows: Cell[][];
  /** Rangos combinados, p. ej. "A1:E1". */
  merges?: string[];
}

// El orden de estos indices tiene que calzar con <cellXfs> en styles.xml de abajo.
const STYLE_INDEX: Record<CellStyle, number> = {
  title: 1,
  subtitle: 2,
  label: 3,
  header: 4,
  money: 5,
  moneyBold: 6,
  muted: 7,
};

/* ---------- XML ---------- */

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escText(s).replace(/"/g, "&quot;");
}

function colLetter(index0: number): string {
  let n = index0;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function cellXml(ref: string, cell: Cell): string {
  if (cell === null || cell === undefined) return "";

  if (typeof cell === "string") {
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escText(cell)}</t></is></c>`;
  }
  if (typeof cell === "number") {
    return `<c r="${ref}"><v>${cell}</v></c>`;
  }
  if ("text" in cell) {
    const s = cell.style ? STYLE_INDEX[cell.style] : 0;
    const sa = s ? ` s="${s}"` : "";
    return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${escText(cell.text)}</t></is></c>`;
  }
  const s = cell.style ? STYLE_INDEX[cell.style] : 0;
  const sa = s ? ` s="${s}"` : "";
  return `<c r="${ref}"${sa}><v>${cell.number}</v></c>`;
}

function sheetXml(spec: SheetSpec): string {
  const rowsXml = spec.rows
    .map((row, ri) => {
      const r = ri + 1;
      const cells = row
        .map((cell, ci) => cellXml(`${colLetter(ci)}${r}`, cell))
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");

  const colsXml = spec.colWidths.length
    ? `<cols>${spec.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const merges = spec.merges ?? [];
  const mergesXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((m) => `<mergeCell ref="${m}"/>`)
        .join("")}</mergeCells>`
    : "";

  const lastRow = spec.rows.length || 1;
  const lastCol = Math.max(1, ...spec.rows.map((r) => r.length));
  const dim = `A1:${colLetter(lastCol - 1)}${lastRow}`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    mergesXml +
    `</worksheet>`
  );
}

// Estilos fijos. El indice de cada <xf> es el que usa STYLE_INDEX.
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₡&quot;#,##0"/></numFmts>` +
  `<fonts count="5">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="16"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><sz val="11"/><color rgb="FF787774"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="12"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF3F3F1"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="2">` +
  `<border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border>` +
  `</borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0 default
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 1 title
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 2 subtitle
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 3 label
  `<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` + // 4 header
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` + // 5 money
  `<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` + // 6 moneyBold
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 7 muted
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

function workbookXml(sheetName: string): string {
  const name = escAttr(sheetName.slice(0, 31));
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

/* ---------- ZIP (STORE) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  data: Uint8Array;
}

function zip(entries: Entry[]): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true); // version needed
    ldv.setUint16(6, 0, true); // flags
    ldv.setUint16(8, 0, true); // method: store
    ldv.setUint16(10, 0, true); // mod time
    ldv.setUint16(12, 0x21, true); // mod date: 1980-01-01
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, size, true); // compressed size
    ldv.setUint32(22, size, true); // uncompressed size
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true); // extra len
    lh.set(nameBytes, 30);
    local.push(lh, e.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0, true); // flags
    cdv.setUint16(10, 0, true); // method
    cdv.setUint16(12, 0, true); // mod time
    cdv.setUint16(14, 0x21, true); // mod date
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true); // extra
    cdv.setUint16(32, 0, true); // comment
    cdv.setUint16(34, 0, true); // disk start
    cdv.setUint16(36, 0, true); // internal attrs
    cdv.setUint32(38, 0, true); // external attrs
    cdv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += lh.length + e.data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true); // disk number
  edv.setUint16(6, 0, true); // disk with central dir
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true); // comment len

  const all = [...local, ...central, eocd];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Construye el binario .xlsx de una hoja. El llamador lo envuelve en Blob/File. */
export function buildXlsx(spec: SheetSpec): Uint8Array {
  const enc = new TextEncoder();
  const part = (s: string) => enc.encode(s);

  return zip([
    { name: "[Content_Types].xml", data: part(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: part(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: part(workbookXml(spec.sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: part(WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: part(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: part(sheetXml(spec)) },
  ]);
}
