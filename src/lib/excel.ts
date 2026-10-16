import * as XLSX from "xlsx";
import type { ArchivoE3, Atributo, ProductoE3 } from "./types";
import { aNumero, norm } from "./texto";
import { reglaVacia } from "./mapeo";

type Fila = unknown[];

function filas(ws: XLSX.WorkSheet): Fila[] {
  return XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, defval: "", raw: true });
}

async function leerLibro(file: File): Promise<XLSX.WorkBook> {
  return XLSX.read(await file.arrayBuffer());
}

function imagenesDe(xml: string): string[] {
  const out: { archivo: string; principal: boolean }[] = [];
  const re = /<picture([^>]*)>([^<]+)<\/picture>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ archivo: m[2].trim(), principal: /thumbnail="true"/.test(m[1]) });
  }
  out.sort((a, b) => Number(b.principal) - Number(a.principal));
  return out.map((x) => x.archivo);
}

/** Columnas pesadas o internas que no sirven para mapear atributos y no se guardan en la base. */
const COLUMNAS_IGNORADAS = new Set([
  "Descripción",
  "Texto",
  "Keywords",
  "Imágenes",
  "Controles Adicionales",
  "Filtros de Búsqueda",
  "Meta Descripción",
  "Meta Título",
  "Meta Keywords",
  "Meta Idioma",
  "Meta Autor",
]);
const MAX_LARGO_CAMPO = 500;

/** "agua-caliente/termotanques/electricos/slug" -> "agua-caliente/termotanques/electricos". */
export function categoriaDeIndices(indices: string): string {
  const partes = indices.replace(/^\/+|\/+$/g, "").split("/");
  return partes.length > 1 ? partes.slice(0, -1).join("/") : "";
}

export async function leerE3(file: File): Promise<ArchivoE3> {
  const wb = await leerLibro(file);
  const rows = filas(wb.Sheets[wb.SheetNames[0]]);
  const headers = (rows[0] ?? []).map((h) => String(h).trim());
  const col = (nombre: string) => headers.indexOf(nombre);
  const iSku = col("Código");
  if (iSku < 0) throw new Error('No encontré la columna "Código". ¿Es un export de Productos E3?');

  const get = (r: Fila, nombre: string) => {
    const i = col(nombre);
    return i < 0 ? "" : String(r[i] ?? "").trim();
  };

  const productos: ProductoE3[] = [];
  for (const r of rows.slice(1)) {
    const sku = String(r[iSku] ?? "").trim();
    if (!sku) continue;
    const campos: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = String(r[i] ?? "").trim();
      if (h && v && !COLUMNAS_IGNORADAS.has(h) && v.length <= MAX_LARGO_CAMPO) campos[h] = v;
    });
    const indices = get(r, "Índices") || get(r, "Url").replace(/^.*?\/tienda\//, "");
    productos.push({
      sku,
      nombre: get(r, "Nombre"),
      indices,
      categoria: categoriaDeIndices(indices),
      precio: aNumero(get(r, "Precio")),
      precioLista: aNumero(get(r, "Precio de Lista")),
      impuestos: aNumero(get(r, "Impuestos")) || 21,
      imagenes: imagenesDe(get(r, "Imágenes")),
      moneda: get(r, "Codigo de moneda") || "ARS",
      envioGratis: norm(get(r, "Envío Gratuito")) === "si",
      stock: aNumero(get(r, "Stock")),
      campos,
    });
  }
  const conValor = headers.filter((h) => h && productos.some((p) => p.campos[h]));
  return { nombreArchivo: file.name, headers: conValor, productos };
}

export interface PlantillaLeida {
  nombreSugerido: string;
  headers: string[];
  defaults: Record<string, string>;
  /** Una lista de atributos por cada hoja "Ayuda". */
  ayudas: { hoja: string; atributos: Atributo[] }[];
}

/**
 * Algunas plantillas (Licuadoras, Pavas, Batidoras) numeran mal los atributos en la hoja Ayuda:
 * dicen "Atributo 2, 3, 4" pero las columnas libres son la 1, 2 y 3 (las que no traen "-").
 * Si los números no caen en columnas libres y la cantidad coincide, se reasignan en orden.
 */
export function corregirSlots(
  atributos: Atributo[],
  headers: string[],
  defaults: Record<string, string>,
): Atributo[] {
  const libres = headers
    .filter((h) => /^atributo \d+/.test(norm(h)) && (defaults[h] ?? "").trim() !== "-")
    .map((h) => Number(norm(h).match(/^atributo (\d+)/)![1]))
    .sort((a, b) => a - b);
  if (!libres.length || atributos.every((a) => libres.includes(a.slot))) return atributos;
  if (libres.length !== atributos.length) return atributos;
  return [...atributos].sort((a, b) => a.slot - b.slot).map((a, i) => ({ ...a, slot: libres[i] }));
}

export async function leerPlantilla(file: File): Promise<PlantillaLeida> {
  const wb = await leerLibro(file);
  const hojaPrincipal =
    wb.SheetNames.find((n) => filas(wb.Sheets[n])[0]?.some((h) => norm(h) === "sku")) ??
    wb.SheetNames[0];
  const rows = filas(wb.Sheets[hojaPrincipal]);
  const headers = (rows[0] ?? []).map((h) => String(h).trim()).filter(Boolean);
  if (!headers.some((h) => norm(h) === "sku")) {
    throw new Error("La plantilla no tiene una columna SKU.");
  }
  const defaults: Record<string, string> = {};
  headers.forEach((h, i) => {
    const v = String(rows[1]?.[i] ?? "").trim();
    if (v) defaults[h] = v;
  });

  const ayudas = wb.SheetNames.filter((n) => /^ayuda/i.test(n.trim())).map((hoja) => {
    const r = filas(wb.Sheets[hoja]);
    const cab = r[0] ?? [];
    const atributos: Atributo[] = [];
    cab.forEach((c, i) => {
      const m = String(c).match(/atributo\s*(\d+)\s*:\s*(.+)/i);
      if (!m) return;
      const opciones = r
        .slice(1)
        .map((x) => String(x[i] ?? "").trim())
        .filter(Boolean);
      atributos.push({ slot: Number(m[1]), nombre: m[2].trim(), opciones, regla: reglaVacia() });
    });
    return { hoja, atributos: corregirSlots(atributos, headers, defaults) };
  });

  const nombreSugerido =
    defaults["Subcategoria 2"] ||
    defaults["Subcategoria 1"] ||
    file.name.replace(/\.xlsx?$/i, "").replace(/^megaofertas\s*-?\s*/i, "");
  return { nombreSugerido, headers, defaults, ayudas };
}

export function descargarXlsx(
  nombreArchivo: string,
  headers: string[],
  filasDatos: (string | number)[][],
  atributos: Atributo[],
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...filasDatos]), "Megaofertas");
  if (atributos.length) {
    const alto = Math.max(...atributos.map((a) => a.opciones.length));
    const ayuda: string[][] = [atributos.map((a) => `Atributo ${a.slot}: ${a.nombre}`)];
    for (let i = 0; i < alto; i++) ayuda.push(atributos.map((a) => a.opciones[i] ?? ""));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ayuda), "Ayuda 1");
  }
  XLSX.writeFile(wb, nombreArchivo);
}
