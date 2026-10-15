import type { Atributo, ProductoE3, Rango, Regla } from "./types";
import { norm, primerNumero } from "./texto";

export type Estado = "ok" | "revisar" | "sin-coincidencia" | "vacio";

export interface Resultado {
  valor: string;
  estado: Estado;
  /** Texto del E3 que se usó, para mostrar en la revisión. */
  origen: string;
}

export function reglaVacia(): Regla {
  return { tipo: "vacio", fuentes: [], mapa: {}, rangos: [], fijo: "", sinCoincidencia: "" };
}

/** Interpreta opciones como "de 10 a 30 Lts", "más de 120 Lts" o "40-49' (102-125 cm)". */
export function rangoDeOpcion(opcion: string): Rango | null {
  const t = norm(opcion);
  const num = (s: string) => parseFloat(s.replace(",", "."));
  let m = t.match(/de\s*(\d+(?:[.,]\d+)?)\s*(?:a|-|hasta)\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { min: num(m[1]), max: num(m[2]), valor: opcion };
  m = t.match(/(?:mas de|mayor a|mayores a|desde|\+)\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { min: num(m[1]), max: Number.MAX_SAFE_INTEGER, valor: opcion };
  m = t.match(/(?:hasta|menos de|menor a|menores a)\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { min: 0, max: num(m[1]), valor: opcion };
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { min: num(m[1]), max: num(m[2]), valor: opcion };
  return null;
}

function opcionMas(opciones: string[]): string {
  return opciones.find((o) => norm(o) === "mas") ?? "";
}

/** Columnas del E3 cuyo nombre coincide con el atributo ("Color" -> "Ficha: Color"). */
function columnasParecidas(nombre: string, headers: string[]): string[] {
  const n = norm(nombre);
  const base = (h: string) => norm(h).replace(/^(filtro|ficha):\s*/, "");
  const exactas = headers.filter((h) => base(h) === n || norm(h) === n);
  const parciales = headers.filter((h) => !exactas.includes(h) && base(h).includes(n));
  const orden = (h: string) => (norm(h).startsWith("filtro:") ? 0 : norm(h).startsWith("ficha:") ? 1 : 2);
  return [...exactas.sort((a, b) => orden(a) - orden(b)), ...parciales.sort((a, b) => orden(a) - orden(b))];
}

/** Palabras clave a partir de las opciones, las más largas primero ("multigas" antes que "gas"). */
function clavesDeOpciones(opciones: string[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  [...opciones]
    .filter((o) => norm(o) !== "mas" && norm(o).length >= 3)
    .sort((a, b) => norm(b).length - norm(a).length)
    .forEach((o) => (mapa[norm(o)] = o));
  return mapa;
}

/**
 * Arma reglas candidatas y, si hay productos del E3, se queda con la que resuelve más productos.
 * Sin productos usa solo el nombre de las columnas.
 */
export function sugerirRegla(atr: Atributo, headers: string[], productos: ProductoE3[] = []): Regla {
  const base = { ...reglaVacia(), sinCoincidencia: opcionMas(atr.opciones) };
  const parecidas = columnasParecidas(atr.nombre, headers).slice(0, 4);
  const exactas = parecidas.filter((h) => norm(h).replace(/^(filtro|ficha):\s*/, "") === norm(atr.nombre));
  const rangos = atr.opciones.map(rangoDeOpcion).filter((r): r is Rango => r !== null);
  const textos = ["Nombre", "Url"].filter((h) => headers.includes(h));

  const candidatas: Regla[] = [];
  if (rangos.length >= 2) {
    // Primero la ficha (número exacto), después los filtros (que ya vienen como rango).
    const fichaPrimero = [...parecidas].sort(
      (a, b) => Number(norm(b).startsWith("ficha:")) - Number(norm(a).startsWith("ficha:")),
    );
    candidatas.push({ ...base, tipo: "rango", fuentes: fichaPrimero, rangos });
    for (const h of parecidas) candidatas.push({ ...base, tipo: "rango", fuentes: [h], rangos });
  }
  if (exactas.length) candidatas.push({ ...base, tipo: "mapa", fuentes: exactas });
  for (const h of parecidas) candidatas.push({ ...base, tipo: "mapa", fuentes: [h] });
  if (textos.length) {
    candidatas.push({ ...base, tipo: "contiene", fuentes: textos, mapa: clavesDeOpciones(atr.opciones) });
  }
  if (!candidatas.length) return base;
  if (!productos.length) return candidatas[0];

  const puntaje = (regla: Regla) => {
    let s = 0;
    for (const p of productos) {
      const e = resolver({ ...atr, regla }, p).estado;
      if (e === "ok") s += 1;
      else if (e === "revisar") s += 0.5;
    }
    // Leve preferencia por campos estructurados frente a buscar palabras en el título.
    return regla.tipo === "contiene" ? s * 0.9 : s;
  };
  let mejor = candidatas[0];
  let mejorPuntaje = puntaje(mejor);
  for (const c of candidatas.slice(1)) {
    const s = puntaje(c);
    if (s > mejorPuntaje) {
      mejor = c;
      mejorPuntaje = s;
    }
  }
  return mejor;
}

function valorDeFuentes(p: ProductoE3, fuentes: string[]): string {
  for (const f of fuentes) {
    const v = p.campos[f];
    if (v) return v;
  }
  return "";
}

/** "termotanques" contiene "termotanque", "calefones" contiene "calefon". */
function contienePalabra(texto: string, palabra: string): boolean {
  if (!palabra || palabra.length < 3) return false;
  return texto.includes(palabra) || texto.includes(palabra.replace(/(es|s)$/, ""));
}

export function resolver(atr: Atributo, p: ProductoE3): Resultado {
  const r = atr.regla;
  const fallback = (origen: string): Resultado =>
    r.sinCoincidencia
      ? { valor: r.sinCoincidencia, estado: "sin-coincidencia", origen }
      : { valor: "", estado: "sin-coincidencia", origen };

  switch (r.tipo) {
    case "vacio":
      return { valor: "", estado: "vacio", origen: "" };
    case "fijo":
      return { valor: r.fijo, estado: "ok", origen: "valor fijo" };
    case "rango": {
      const src = valorDeFuentes(p, r.fuentes);
      const n = primerNumero(src);
      if (n === null) return fallback(src);
      const hit = r.rangos.find((x) => n >= x.min && n <= x.max);
      return hit ? { valor: hit.valor, estado: "ok", origen: src } : fallback(src);
    }
    case "contiene": {
      const texto = norm(r.fuentes.map((f) => p.campos[f] ?? "").join(" "));
      for (const [clave, valor] of Object.entries(r.mapa)) {
        if (valor && contienePalabra(texto, clave)) return { valor, estado: "ok", origen: clave };
      }
      const auto = atr.opciones.find((o) => norm(o) !== "mas" && contienePalabra(texto, norm(o)));
      return auto ? { valor: auto, estado: "revisar", origen: norm(auto) } : fallback("");
    }
    case "mapa": {
      const src = valorDeFuentes(p, r.fuentes);
      if (!src) return fallback("");
      const partes = [src, ...src.split(",").map((s) => s.trim())];
      for (const parte of partes) {
        const v = r.mapa[norm(parte)];
        if (v) return { valor: v, estado: "ok", origen: parte };
      }
      for (const parte of partes) {
        const exacta = atr.opciones.find((o) => norm(o) === norm(parte));
        if (exacta) return { valor: exacta, estado: "ok", origen: parte };
      }
      for (const parte of partes) {
        const n = norm(parte);
        const parecida = atr.opciones.find(
          (o) => norm(o) !== "mas" && norm(o).length >= 3 && (n.includes(norm(o)) || norm(o).includes(n)),
        );
        if (parecida && n.length >= 3) return { valor: parecida, estado: "revisar", origen: parte };
      }
      return fallback(src);
    }
  }
}

/** Valores distintos que aparecen en las fuentes, con cuántos productos los tienen. */
export function valoresDistintos(productos: ProductoE3[], fuentes: string[]): { valor: string; cantidad: number }[] {
  const cuenta = new Map<string, { valor: string; cantidad: number }>();
  for (const p of productos) {
    const src = valorDeFuentes(p, fuentes);
    if (!src) continue;
    const k = norm(src);
    const actual = cuenta.get(k) ?? { valor: src, cantidad: 0 };
    actual.cantidad++;
    cuenta.set(k, actual);
  }
  return [...cuenta.values()].sort((a, b) => b.cantidad - a.cantidad);
}
