import type { Ajustes, ProductoE3, Rubro } from "./types";
import { norm, skuFirebase, terminaEn9 } from "./texto";
import { resolver, type Resultado } from "./mapeo";

const NV_IMG_PREFIX = "http://novogar.com.ar/image/0/500_375-";
const WSRV_PREFIX = "http://wsrv.nl/?url=";
const WSRV_SUFFIX = "&w=500&h=375&fit=contain&bg=white&output=jpg";

export function urlImagen(archivo: string): string {
  return WSRV_PREFIX + NV_IMG_PREFIX + archivo + WSRV_SUFFIX;
}

export interface FilaGenerada {
  sku: string;
  valores: (string | number)[];
  atributos: (Resultado & { nombre: string })[];
  avisos: string[];
  imagenes: string[];
}

export function linkProducto(p: ProductoE3): string {
  const path = p.indices.replace(/^\/+/, "");
  return path ? "https://www.novogar.com.ar/tienda/" + path : "";
}

function precios(p: ProductoE3, ajustes: Ajustes, contadoWeb: Map<string, number> | null) {
  // Los SKU terminados en -1 son ofertas: su precio es el del E3 (DefaultPrice), igual que en el Apps Script.
  const esOferta = /-1$/.test(p.sku);
  const base =
    ajustes.fuentePrecio === "firebase" && !esOferta ? (contadoWeb?.get(skuFirebase(p.sku)) ?? 0) : p.precio;
  const oferta = terminaEn9(base);
  const anterior =
    ajustes.precioAnterior === "lista"
      ? terminaEn9(p.precioLista)
      : terminaEn9(oferta * (1 + ajustes.porcentajeAnterior / 100));
  const sinImpuestos = Math.round(oferta / (1 + p.impuestos / 100));
  return { oferta, anterior, sinImpuestos };
}

export function generarFila(
  p: ProductoE3,
  rubro: Rubro,
  ajustes: Ajustes,
  contadoWeb: Map<string, number> | null,
): FilaGenerada {
  const avisos: string[] = [];
  const link = linkProducto(p);
  const { oferta, anterior, sinImpuestos } = precios(p, ajustes, contadoWeb);
  const imagenes = p.imagenes.slice(0, 3).map(urlImagen);
  const atributos = rubro.atributos.map((a) => ({ nombre: a.nombre, ...resolver(a, p) }));
  const envioGratis = ajustes.envioGratis === "e3" ? (p.envioGratis ? 1 : 0) : Number(ajustes.envioGratis);

  if (p.nombre.length > 70) avisos.push(`Título de ${p.nombre.length} caracteres (máx. 70)`);
  if (!link) avisos.push("Falta el link (Índices)");
  if (!oferta) avisos.push("Sin precio de oferta");
  else if (anterior <= oferta) avisos.push("El precio anterior no es mayor al de oferta");
  if (!imagenes.length) avisos.push("Sin imágenes");

  const valores = rubro.headers.map((h): string | number => {
    const n = norm(h);
    const def = rubro.defaults[h] ?? "";
    const slot = n.match(/^atributo (\d+)/);
    if (slot) {
      const i = rubro.atributos.findIndex((a) => a.slot === Number(slot[1]));
      return i >= 0 ? atributos[i].valor : def;
    }
    const img = n.match(/^url imagen (\d+)/);
    if (img) return imagenes[Number(img[1]) - 1] ?? "";
    if (n === "sku") return p.sku;
    if (n === "titulo") return p.nombre;
    if (n === "link previo") return link;
    if (n === "link") return link ? link + ajustes.utm : "";
    if (n.startsWith("oferta activa")) return ajustes.ofertaActiva;
    if (n === "precio anterior") return anterior;
    if (n === "precio en oferta") return oferta;
    if (n.startsWith("precio sin impuestos")) return sinImpuestos;
    if (n === "precio unitario") return oferta;
    if (n === "financiacion") return ajustes.financiacion;
    if (n.startsWith("sin interes")) return ajustes.sinInteres;
    if (n.startsWith("retiro en tienda")) return ajustes.retiro;
    if (n.startsWith("envio a todo el pais")) return ajustes.envioPais;
    if (n.startsWith("envio gratis")) return envioGratis;
    if (n.startsWith("promociones bancarias")) return ajustes.promosBancarias;
    if (n.startsWith("producto internacional")) return ajustes.internacional;
    if (n === "unidad") return ajustes.unidad;
    if (n === "moneda") return def || p.moneda;
    if (n === "tipo de promocion") return def || "Descuento";
    if (n === "referencia") return "";
    return def;
  });

  return { sku: p.sku, valores, atributos, avisos, imagenes };
}

/** Comprueba que cada imagen cargue, con unos pocos pedidos en paralelo. */
export async function validarImagenes(
  urls: string[],
  progreso?: (hechos: number, total: number) => void,
): Promise<Set<string>> {
  const fallidas = new Set<string>();
  const unicas = [...new Set(urls)];
  let hechos = 0;
  let i = 0;
  const cargar = (url: string) =>
    new Promise<boolean>((resolve) => {
      const img = new Image();
      const t = setTimeout(() => resolve(false), 20000);
      img.onload = () => (clearTimeout(t), resolve(img.naturalWidth > 0));
      img.onerror = () => (clearTimeout(t), resolve(false));
      img.src = url.replace(/^http:\/\/wsrv\.nl/, "https://wsrv.nl");
    });
  const trabajador = async () => {
    while (i < unicas.length) {
      const url = unicas[i++];
      if (!(await cargar(url))) fallidas.add(url);
      progreso?.(++hechos, unicas.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, trabajador));
  return fallidas;
}
