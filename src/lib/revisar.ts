import * as XLSX from "xlsx";
import { aNumero, norm } from "./texto";

/** Columnas de la planilla de precios que se recalculan. */
export const COLUMNAS = ["web", "anterior", "oferta", "sinImpuesto"] as const;
export type Columna = (typeof COLUMNAS)[number];

export type Precios = Record<Columna, number>;

export interface FilaPlanilla {
  /** Fila de Excel (1 = primera). */
  fila: number;
  sku: string;
  rubro: string;
  subrubro: string;
  iva: number;
  actual: Precios;
}

export interface PlanillaPrecios {
  nombreArchivo: string;
  hoja: string;
  /** Letra de columna de cada precio en la hoja ("F", "G"…); null si la planilla no la tiene. */
  letras: Record<Columna, string | null>;
  filas: FilaPlanilla[];
  datos: ArrayBuffer;
}

export interface Formula {
  porcentajeOferta: number;
  porcentajeAnterior: number;
  decimalesSinImpuesto: number;
}

export const FORMULA_DEFAULT: Formula = { porcentajeOferta: 15, porcentajeAnterior: 15, decimalesSinImpuesto: 2 };

const redondear = (n: number, decimales = 0) => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * Misma cuenta que la planilla: oferta = web + %, redondeado; anterior = oferta + %, redondeado;
 * sin impuesto = (web + %, sin redondear) / (1 + IVA).
 */
export function calcularPrecios(web: number, iva: number, f: Formula): Precios {
  const ofertaExacta = web * (1 + f.porcentajeOferta / 100);
  const oferta = redondear(ofertaExacta);
  return {
    web,
    oferta,
    anterior: redondear(oferta * (1 + f.porcentajeAnterior / 100)),
    sinImpuesto: redondear(ofertaExacta / (1 + iva / 100), Math.max(0, Math.round(f.decimalesSinImpuesto))),
  };
}

export const iguales = (a: number, b: number) => Math.abs(a - b) < 0.005;

const ENCABEZADOS: Record<Columna | "sku" | "iva" | "rubro" | "subrubro", (h: string) => boolean> = {
  sku: (h) => h === "sku",
  rubro: (h) => h === "rubro",
  subrubro: (h) => h === "subrubro",
  iva: (h) => h === "iva" || h.startsWith("impuesto"),
  web: (h) => h === "precio web",
  anterior: (h) => h === "precio anterior",
  oferta: (h) => h === "precio oferta" || h === "precio en oferta",
  sinImpuesto: (h) => h.startsWith("precio sin impuesto"),
};

export async function leerPlanillaPrecios(file: File): Promise<PlanillaPrecios> {
  const datos = await file.arrayBuffer();
  const wb = XLSX.read(datos);
  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja];
    if (!ws["!ref"]) continue;
    const rango = XLSX.utils.decode_range(ws["!ref"]);
    const valor = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v;

    // El encabezado puede no estar en la primera fila: se busca en las primeras 10.
    for (let r = rango.s.r; r <= Math.min(rango.e.r, rango.s.r + 9); r++) {
      const col: Partial<Record<keyof typeof ENCABEZADOS, number>> = {};
      for (let c = rango.s.c; c <= rango.e.c; c++) {
        const h = norm(valor(r, c));
        for (const [k, es] of Object.entries(ENCABEZADOS)) {
          if (col[k as keyof typeof ENCABEZADOS] === undefined && h && es(h)) col[k as keyof typeof ENCABEZADOS] = c;
        }
      }
      if (col.sku === undefined || col.web === undefined) continue;

      const letras = Object.fromEntries(
        COLUMNAS.map((k) => [k, col[k] === undefined ? null : XLSX.utils.encode_col(col[k]!)]),
      ) as Record<Columna, string | null>;
      const filas: FilaPlanilla[] = [];
      let rubro = "";
      let subrubro = "";
      for (let f = r + 1; f <= rango.e.r; f++) {
        // Rubro y subrubro se escriben solo en la primera fila del grupo.
        if (col.rubro !== undefined && String(valor(f, col.rubro) ?? "").trim()) rubro = String(valor(f, col.rubro)).trim();
        if (col.subrubro !== undefined && String(valor(f, col.subrubro) ?? "").trim())
          subrubro = String(valor(f, col.subrubro)).trim();
        const sku = String(valor(f, col.sku) ?? "").trim();
        if (!sku) continue;
        const num = (k: Columna) => (col[k] === undefined ? 0 : aNumero(valor(f, col[k]!)));
        filas.push({
          fila: f + 1,
          sku,
          rubro,
          subrubro,
          iva: col.iva === undefined ? 21 : aNumero(valor(f, col.iva)) || 21,
          actual: { web: num("web"), anterior: num("anterior"), oferta: num("oferta"), sinImpuesto: num("sinImpuesto") },
        });
      }
      return { nombreArchivo: file.name, hoja, letras, filas, datos };
    }
  }
  throw new Error('No encontré una hoja con las columnas "SKU" y "PRECIO WEB".');
}

/* ---------- Escritura: se editan las celdas dentro del .xlsx para no perder colores ni formatos ---------- */

/** Contenedor zip de SheetJS (CFB no trae tipos). */
type Zip = unknown;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function leerXml(zip: Zip, ruta: string): string | null {
  const e = XLSX.CFB.find(zip, "/" + ruta);
  return e?.content ? decoder.decode(new Uint8Array(e.content as ArrayLike<number>)) : null;
}

function escribirXml(zip: Zip, ruta: string, xml: string) {
  XLSX.CFB.utils.cfb_add(zip, "/" + ruta, encoder.encode(xml));
}

const atributo = (tag: string, nombre: string) => tag.match(new RegExp(`\\s${nombre}="([^"]*)"`))?.[1];
const valorXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Ruta del XML de la hoja dentro del .xlsx ("xl/worksheets/sheet1.xml"). */
function rutaHoja(zip: Zip, hoja: string): string {
  const wb = leerXml(zip, "xl/workbook.xml") ?? "";
  const tag = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => valorXml(atributo(t, "name") ?? "") === hoja);
  const id = tag && (atributo(tag, "r:id") ?? tag.match(/\s\w+:id="([^"]*)"/)?.[1]);
  const rels = leerXml(zip, "xl/_rels/workbook.xml.rels") ?? "";
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => atributo(t, "Id") === id);
  const target = rel && atributo(rel, "Target");
  if (!target) throw new Error(`No encontré la hoja "${hoja}" dentro del archivo.`);
  return target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
}

const numeroColumna = (letras: string) => [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0);

/**
 * Escribe un número en la celda. Si la celda tiene fórmula se deja y solo se actualiza el valor guardado
 * (Excel la recalcula al abrir), salvo `quitarFormula`, que la reemplaza por el valor.
 */
function ponerNumero(xml: string, ref: string, valor: number, quitarFormula: boolean): string {
  const reCelda = new RegExp(`<c\\b[^>]*?\\sr="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const celda = xml.match(reCelda)?.[0];
  if (celda) {
    const apertura = celda.match(/^<c\b[^>]*?(?=\/?>)/)![0].replace(/\st="[^"]*"/, "");
    let formula = celda.match(/<f\b[\s\S]*?(?:\/>|<\/f>)/)?.[0] ?? "";
    // Una fórmula compartida "maestra" (con ref) no se puede sacar sin romper las que dependen de ella.
    if (quitarFormula && !/^<f\b[^>]*\sref="/.test(formula)) formula = "";
    return xml.replace(reCelda, `${apertura}>${formula}<v>${valor}</v></c>`);
  }
  const fila = ref.match(/\d+$/)![0];
  const reFila = new RegExp(`<row\\b[^>]*?\\sr="${fila}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`);
  const m = xml.match(reFila);
  if (!m) return xml;
  const nueva = `<c r="${ref}"><v>${valor}</v></c>`;
  const col = numeroColumna(ref.replace(/\d+$/, ""));
  const apertura = m[0].match(/^<row\b[^>]*?(?=\/?>)/)![0];
  const celdas = m[1] ?? "";
  // Se inserta antes de la primera celda de una columna posterior, para respetar el orden.
  const siguiente = [...celdas.matchAll(/<c\b[^>]*?\sr="([A-Z]+)\d+"/g)].find((c) => numeroColumna(c[1]) > col);
  const cuerpo = siguiente
    ? celdas.slice(0, siguiente.index) + nueva + celdas.slice(siguiente.index)
    : celdas + nueva;
  return xml.replace(reFila, `${apertura}>${cuerpo}</row>`);
}

export interface Cambio {
  fila: number;
  precios: Precios;
}

/** Devuelve una copia del .xlsx con los precios nuevos, conservando todo lo demás del archivo. */
export function actualizarXlsx(planilla: PlanillaPrecios, cambios: Cambio[]): Uint8Array {
  const zip = XLSX.CFB.read(new Uint8Array(planilla.datos), { type: "array" });
  const ruta = rutaHoja(zip, planilla.hoja);
  let xml = leerXml(zip, ruta);
  if (xml === null) throw new Error("No pude leer la hoja dentro del archivo.");
  for (const c of cambios) {
    for (const k of COLUMNAS) {
      const letra = planilla.letras[k];
      if (letra) xml = ponerNumero(xml, `${letra}${c.fila}`, c.precios[k], k === "web");
    }
  }
  escribirXml(zip, ruta, xml);

  // Que Excel recalcule las fórmulas al abrir, y sin la cadena de cálculo vieja (Excel la rehace).
  let wb = leerXml(zip, "xl/workbook.xml") ?? "";
  if (/<calcPr\b/.test(wb)) {
    wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, attrs: string, cierre: string) =>
      `<calcPr${attrs.replace(/\sfullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"${cierre}>`,
    );
  } else {
    // calcPr va después de sheets/definedNames: el orden de los elementos importa en Excel.
    const despues = wb.includes("</definedNames>") ? "</definedNames>" : "</sheets>";
    wb = wb.replace(despues, despues + '<calcPr fullCalcOnLoad="1"/>');
  }
  escribirXml(zip, "xl/workbook.xml", wb);
  if (XLSX.CFB.utils.cfb_del(zip, "/xl/calcChain.xml")) {
    const rels = leerXml(zip, "xl/_rels/workbook.xml.rels");
    if (rels) escribirXml(zip, "xl/_rels/workbook.xml.rels", rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ""));
    const tipos = leerXml(zip, "[Content_Types].xml");
    if (tipos) escribirXml(zip, "[Content_Types].xml", tipos.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ""));
  }
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array" }) as ArrayLike<number>);
}

export function descargarBytes(nombre: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
