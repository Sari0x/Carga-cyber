import { supabase } from "./supabase/client";
import { AJUSTES_DEFAULT, type Ajustes, type ProductoE3, type Rubro } from "./types";

const COLS_RUBRO = "id, nombre, headers, defaults, atributos, categorias";

export async function listarRubros(): Promise<Rubro[]> {
  const { data, error } = await supabase.from("rubros").select(COLS_RUBRO).order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []) as Rubro[];
}

export async function crearRubro(r: Omit<Rubro, "id">): Promise<Rubro> {
  const { data, error } = await supabase.from("rubros").insert(r).select(COLS_RUBRO).single();
  if (error) throw new Error(error.message);
  return data as Rubro;
}

export async function guardarRubro(r: Rubro): Promise<void> {
  const { error } = await supabase
    .from("rubros")
    .update({
      nombre: r.nombre,
      headers: r.headers,
      defaults: r.defaults,
      atributos: r.atributos,
      categorias: r.categorias,
    })
    .eq("id", r.id);
  if (error) throw new Error(error.message);
}

export async function borrarRubro(id: string): Promise<void> {
  const { error } = await supabase.from("rubros").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function leerAjustes(): Promise<Ajustes> {
  const { data, error } = await supabase.from("ajustes").select("valor").eq("clave", "general").maybeSingle();
  if (error) throw new Error(error.message);
  return { ...AJUSTES_DEFAULT, ...((data?.valor as Partial<Ajustes>) ?? {}) };
}

export async function guardarAjustes(a: Ajustes): Promise<void> {
  const { error } = await supabase.from("ajustes").upsert({ clave: "general", valor: a });
  if (error) throw new Error(error.message);
}

// ---------- Base de productos ----------

interface FilaProducto {
  sku: string;
  sku_norm: string;
  nombre: string;
  indices: string;
  categoria: string;
  precio: number;
  precio_lista: number;
  impuestos: number;
  imagenes: string[];
  moneda: string;
  envio_gratis: boolean;
  stock: number;
  campos: Record<string, string>;
}

export const normSku = (sku: string) => sku.trim().toUpperCase();

const aFila = (p: ProductoE3): FilaProducto => ({
  sku: p.sku,
  sku_norm: normSku(p.sku),
  nombre: p.nombre,
  indices: p.indices,
  categoria: p.categoria,
  precio: p.precio,
  precio_lista: p.precioLista,
  impuestos: p.impuestos,
  imagenes: p.imagenes,
  moneda: p.moneda,
  envio_gratis: p.envioGratis,
  stock: p.stock,
  campos: p.campos,
});

const deFila = (f: FilaProducto): ProductoE3 => ({
  sku: f.sku,
  nombre: f.nombre,
  indices: f.indices,
  categoria: f.categoria,
  precio: Number(f.precio),
  precioLista: Number(f.precio_lista),
  impuestos: Number(f.impuestos),
  imagenes: f.imagenes ?? [],
  moneda: f.moneda,
  envioGratis: f.envio_gratis,
  stock: Number(f.stock),
  campos: f.campos ?? {},
});

const LOTE_SUBIDA = 300;
const LOTE_CONSULTA = 150;
const PAGINA = 1000;

/** Crea o actualiza los productos por SKU. Los que no vienen en el archivo quedan como estaban. */
export async function subirProductos(
  productos: ProductoE3[],
  progreso?: (hechos: number, total: number) => void,
): Promise<void> {
  // Si el archivo trae un SKU repetido, gana la última fila.
  const unicos = [...new Map(productos.map((p) => [normSku(p.sku), p])).values()];
  for (let i = 0; i < unicos.length; i += LOTE_SUBIDA) {
    const lote = unicos.slice(i, i + LOTE_SUBIDA).map(aFila);
    const { error } = await supabase.from("productos").upsert(lote, { onConflict: "sku_norm" });
    if (error) throw new Error(error.message);
    progreso?.(Math.min(i + LOTE_SUBIDA, unicos.length), unicos.length);
  }
}

export async function resumenBase(): Promise<{ total: number; actualizado: string | null }> {
  const { count, error } = await supabase.from("productos").select("sku", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  const { data } = await supabase
    .from("productos")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { total: count ?? 0, actualizado: (data?.updated_at as string | undefined) ?? null };
}

export async function buscarPorSkus(skus: string[]): Promise<ProductoE3[]> {
  const claves = [...new Set(skus.map(normSku).filter(Boolean))];
  const out: ProductoE3[] = [];
  for (let i = 0; i < claves.length; i += LOTE_CONSULTA) {
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .in("sku_norm", claves.slice(i, i + LOTE_CONSULTA));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as FilaProducto[]).map(deFila));
  }
  return out;
}

export async function productosDeCategorias(categorias: string[]): Promise<ProductoE3[]> {
  if (!categorias.length) return [];
  const out: ProductoE3[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .in("categoria", categorias)
      .order("sku")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as FilaProducto[];
    out.push(...filas.map(deFila));
    if (filas.length < PAGINA) return out;
  }
}

export async function listarCategorias(): Promise<{ categoria: string; cantidad: number }[]> {
  const { data, error } = await supabase.from("categorias_productos").select("categoria, cantidad");
  if (error) throw new Error(error.message);
  return (data ?? []) as { categoria: string; cantidad: number }[];
}

/** Columnas con valor en al menos un producto, para elegir fuentes en las reglas. */
export function columnasDe(productos: ProductoE3[]): string[] {
  const s = new Set<string>();
  for (const p of productos) for (const k of Object.keys(p.campos)) s.add(k);
  return [...s].sort((a, b) => a.localeCompare(b, "es"));
}
