/** Minúsculas, sin acentos y con espacios simples, para comparar textos. */
export function norm(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Primer número del texto: "60 Lts" -> 60, "68,5 cm" -> 68.5. */
export function primerNumero(valor: unknown): number | null {
  const m = String(valor ?? "").match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return isNaN(n) ? null : n;
}

export function aNumero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const n = parseFloat(String(valor ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Redondea hacia arriba para que el precio termine en 9 (igual que el Apps Script). */
export function terminaEn9(valor: number): number {
  if (!valor || valor <= 0) return 0;
  return Math.ceil(valor / 10) * 10 - 1;
}

/** SKU sin guiones ni símbolos, en mayúsculas (clave de Firebase). */
export function skuFirebase(sku: string): string {
  return sku.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
