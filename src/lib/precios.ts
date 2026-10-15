import { aNumero, skuFirebase } from "./texto";

const FB_PRECIOS = "https://precios-novogar-default-rtdb.firebaseio.com/precios";
const LOTE = 10;
const PAUSA_MS = 300;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Busca contadoWeb en Firebase de a un SKU por pedido, en lotes chicos,
 * para no gastar la cuota bajando precios.json entero.
 */
export async function contadoWebPorSku(
  skus: string[],
  progreso?: (hechos: number, total: number) => void,
): Promise<Map<string, number>> {
  const claves = [...new Set(skus.map(skuFirebase).filter(Boolean))];
  const out = new Map<string, number>();
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = claves.slice(i, i + LOTE);
    await Promise.all(
      lote.map(async (clave) => {
        const res = await fetch(`${FB_PRECIOS}/${encodeURIComponent(clave)}.json`);
        const body = await res.text();
        if (body.includes("Bandwidth quota exceeded")) {
          throw new Error("Cuota de Firebase agotada. Esperá al reset diario (medianoche UTC) o usá precios del E3.");
        }
        if (!res.ok) return;
        const data = JSON.parse(body) as { contadoWeb?: unknown; ContadoWeb?: unknown } | null;
        const precio = aNumero(data?.contadoWeb ?? data?.ContadoWeb);
        if (precio > 0) out.set(clave, precio);
      }),
    );
    progreso?.(Math.min(i + LOTE, claves.length), claves.length);
    if (i + LOTE < claves.length) await esperar(PAUSA_MS);
  }
  return out;
}
