"use client";

import { useState } from "react";
import { leerE3 } from "@/lib/excel";
import { subirProductos } from "@/lib/datos";
import type { ArchivoE3 } from "@/lib/types";

interface Props {
  resumen: { total: number; actualizado: string | null } | null;
  recargar: () => Promise<void>;
}

export default function Base({ resumen, recargar }: Props) {
  const [archivo, setArchivo] = useState<ArchivoE3 | null>(null);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function leer(file: File) {
    setError("");
    setEstado("Leyendo el archivo…");
    setOcupado(true);
    try {
      const a = await leerE3(file);
      setArchivo(a);
      setEstado("");
    } catch (e) {
      setError((e as Error).message);
      setEstado("");
    } finally {
      setOcupado(false);
    }
  }

  async function subir() {
    if (!archivo) return;
    setOcupado(true);
    setError("");
    try {
      await subirProductos(archivo.productos, (h, t) => setEstado(`Guardando productos… ${h}/${t}`));
      setEstado(`Listo: ${archivo.productos.length} productos guardados o actualizados.`);
      setArchivo(null);
      await recargar();
    } catch (e) {
      setError("Error al guardar: " + (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const categorias = archivo ? new Set(archivo.productos.map((p) => p.categoria)).size : 0;
  const filtros = archivo ? archivo.headers.filter((h) => /^(filtro|ficha):/i.test(h)).length : 0;

  return (
    <div className="stack">
      <div className="card">
        <h2>Base de productos</h2>
        <p className="muted">
          {resumen
            ? `${resumen.total} productos guardados${
                resumen.actualizado
                  ? `, última actualización ${new Date(resumen.actualizado).toLocaleString("es-AR")}`
                  : ""
              }.`
            : "Leyendo…"}
        </p>
        <p className="muted small">
          Importá el export de Productos E3 (puede ser la base completa o solo una parte). Cada producto se guarda o
          se actualiza por SKU con sus precios, imágenes, filtros y ficha técnica. Los productos que no vengan en el
          archivo quedan como estaban.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={ocupado}
          onChange={(ev) => {
            if (ev.target.files?.[0]) leer(ev.target.files[0]);
            ev.target.value = "";
          }}
        />
      </div>

      {error && <div className="alert error">{error}</div>}
      {estado && <div className="alert">{estado}</div>}

      {archivo && (
        <div className="card">
          <h2>{archivo.nombreArchivo}</h2>
          <p>
            <strong>{archivo.productos.length}</strong> productos · {categorias} categorías · {filtros} columnas de
            filtros y ficha técnica.
          </p>
          <button className="btn primary" disabled={ocupado} onClick={subir}>
            Guardar en la base
          </button>{" "}
          <button className="btn" disabled={ocupado} onClick={() => setArchivo(null)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
