export type ReglaTipo = "mapa" | "contiene" | "rango" | "fijo" | "vacio";

export interface Rango {
  min: number;
  max: number;
  valor: string;
}

export interface Regla {
  tipo: ReglaTipo;
  /** Columnas del E3, en orden de prioridad: se usa la primera con valor. */
  fuentes: string[];
  /** mapa: valor normalizado del E3 -> opción. contiene: palabra clave normalizada -> opción. */
  mapa: Record<string, string>;
  rangos: Rango[];
  fijo: string;
  /** Valor a usar cuando ninguna regla coincide (por ejemplo "Más"). */
  sinCoincidencia: string;
}

export interface Atributo {
  slot: number;
  nombre: string;
  opciones: string[];
  regla: Regla;
}

export interface Rubro {
  id: string;
  nombre: string;
  headers: string[];
  defaults: Record<string, string>;
  atributos: Atributo[];
  /** Categorías de la tienda (Índices sin el último tramo) de donde salen los productos del rubro. */
  categorias: string[];
}

export interface Ajustes {
  utm: string;
  fuentePrecio: "e3" | "firebase";
  /** % que se suma al precio contado para obtener el precio en oferta. */
  porcentajeOferta: number;
  precioAnterior: "lista" | "porcentaje";
  porcentajeAnterior: number;
  ofertaActiva: number;
  financiacion: number;
  sinInteres: number;
  retiro: number;
  envioPais: number;
  envioGratis: "0" | "1" | "e3";
  promosBancarias: number;
  internacional: number;
  unidad: string;
}

export const AJUSTES_DEFAULT: Ajustes = {
  utm: "?utm_source=producto_cybermonday&utm_medium=referral&utm_campaign=cybermonday2026",
  fuentePrecio: "e3",
  porcentajeOferta: 15,
  precioAnterior: "porcentaje",
  porcentajeAnterior: 15,
  ofertaActiva: 0,
  financiacion: 24,
  sinInteres: 0,
  retiro: 1,
  envioPais: 1,
  envioGratis: "0",
  promosBancarias: 0,
  internacional: 0,
  unidad: "un",
};

export interface ProductoE3 {
  sku: string;
  nombre: string;
  indices: string;
  categoria: string;
  precio: number;
  precioLista: number;
  impuestos: number;
  imagenes: string[];
  moneda: string;
  envioGratis: boolean;
  stock: number;
  /** Todas las columnas con valor, por nombre de columna. */
  campos: Record<string, string>;
}

export interface ArchivoE3 {
  nombreArchivo: string;
  headers: string[];
  productos: ProductoE3[];
}
