"use client";

import { useState } from "react";
import type { Rubro } from "@/lib/types";
import { leerPlantilla, type PlantillaLeida } from "@/lib/excel";
import { borrarRubro, crearRubro } from "@/lib/datos";
import EditorRubro from "./EditorRubro";

interface Props {
  rubros: Rubro[];
  recargar: () => Promise<void>;
}

export default function Rubros({ rubros, recargar }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [plantilla, setPlantilla] = useState<PlantillaLeida | null>(null);
  const [nombre, setNombre] = useState("");
  const [hoja, setHoja] = useState(0);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function leer(file: File) {
    setError("");
    try {
      const p = await leerPlantilla(file);
      if (!p.ayudas.length) throw new Error('La plantilla no tiene hoja "Ayuda" con los atributos.');
      setPlantilla(p);
      setNombre(p.nombreSugerido);
      setHoja(0);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crear() {
    if (!plantilla) return;
    setOcupado(true);
    try {
      const r = await crearRubro({
        nombre: nombre.trim() || plantilla.nombreSugerido,
        headers: plantilla.headers,
        defaults: plantilla.defaults,
        atributos: plantilla.ayudas[hoja].atributos,
        categorias: [],
      });
      await recargar();
      setPlantilla(null);
      setEditando(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(r: Rubro) {
    if (!window.confirm(`¿Borrar el rubro "${r.nombre}" y sus reglas?`)) return;
    try {
      await borrarRubro(r.id);
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const actual = rubros.find((r) => r.id === editando);
  if (actual) {
    return <EditorRubro key={actual.id} rubro={actual} volver={() => setEditando(null)} recargar={recargar} />;
  }

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>Nuevo rubro desde plantilla</h2>
        <p className="muted small">
          Subí la plantilla de megaofertas del rubro (la que trae la hoja &quot;Ayuda 1&quot; con los atributos y sus
          valores permitidos). Después elegís de qué categorías de la tienda son sus productos y la app sugiere las
          reglas de mapeo con los datos de la base.
        </p>
        <input type="file" accept=".xlsx,.xls" onChange={(ev) => ev.target.files?.[0] && leer(ev.target.files[0])} />
        {plantilla && (
          <div className="grid2 top-gap">
            <label className="field">
              <span className="label">Nombre del rubro</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            {plantilla.ayudas.length > 1 && (
              <label className="field">
                <span className="label">Hoja de atributos</span>
                <select value={hoja} onChange={(e) => setHoja(Number(e.target.value))}>
                  {plantilla.ayudas.map((a, i) => (
                    <option key={a.hoja} value={i}>
                      {a.hoja} ({a.atributos.length} atributos)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="wide small muted">
              Categoría: {plantilla.defaults["Categoria"]} › {plantilla.defaults["Subcategoria 1"]} ›{" "}
              {plantilla.defaults["Subcategoria 2"]} · Atributos:{" "}
              {plantilla.ayudas[hoja].atributos.map((a) => `${a.nombre} (${a.opciones.length})`).join(", ")}
            </div>
            <div className="wide">
              <button className="btn primary" disabled={ocupado} onClick={crear}>
                Crear rubro
              </button>{" "}
              <button className="btn" onClick={() => setPlantilla(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Rubros</h2>
        {rubros.length === 0 ? (
          <p className="muted">Todavía no hay rubros.</p>
        ) : (
          <ul className="list">
            {rubros.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.nombre}</strong>
                  <div className="muted small">{r.atributos.map((a) => a.nombre).join(" · ")}</div>
                  <div className={`small ${r.categorias?.length ? "muted" : "warn-text"}`}>
                    {r.categorias?.length
                      ? `Categorías: ${r.categorias.join(", ")}`
                      : "Sin categorías elegidas: abrí el editor para elegirlas y sugerir las reglas."}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="btn" onClick={() => setEditando(r.id)}>
                    Editar reglas
                  </button>
                  <button className="btn danger" onClick={() => borrar(r)}>
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
