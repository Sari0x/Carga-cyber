"use client";

import { useCallback, useEffect, useState } from "react";
import Generar from "@/components/Generar";
import Rubros from "@/components/Rubros";
import { leerE3 } from "@/lib/excel";
import { leerAjustes, listarRubros } from "@/lib/datos";
import { AJUSTES_DEFAULT, type Ajustes, type ArchivoE3, type Rubro } from "@/lib/types";

type Tab = "generar" | "rubros";

export default function Home() {
  const [tab, setTab] = useState<Tab>("generar");
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_DEFAULT);
  const [e3, setE3] = useState<ArchivoE3 | null>(null);
  const [error, setError] = useState("");
  const [cargandoE3, setCargandoE3] = useState(false);

  const recargarRubros = useCallback(async () => {
    try {
      setRubros(await listarRubros());
    } catch (e) {
      setError("No pude leer los rubros: " + (e as Error).message);
    }
  }, []);

  useEffect(() => {
    recargarRubros();
    leerAjustes()
      .then(setAjustes)
      .catch((e) => setError("No pude leer los ajustes: " + (e as Error).message));
  }, [recargarRubros]);

  async function importarE3(file: File) {
    setCargandoE3(true);
    setError("");
    try {
      setE3(await leerE3(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoE3(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Carga Cyber</h1>
          <p className="muted">Genera los Excel de megaofertas a partir del export de Productos E3.</p>
        </div>
        <label className="e3-box">
          <span className="label">Productos E3</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(ev) => ev.target.files?.[0] && importarE3(ev.target.files[0])}
          />
          <span className="muted small">
            {cargandoE3
              ? "Leyendo…"
              : e3
                ? `${e3.nombreArchivo}: ${e3.productos.length} productos`
                : "Todavía no importaste un E3"}
          </span>
        </label>
      </header>

      <nav className="tabs">
        <button className={tab === "generar" ? "on" : ""} onClick={() => setTab("generar")}>
          Generar archivo
        </button>
        <button className={tab === "rubros" ? "on" : ""} onClick={() => setTab("rubros")}>
          Rubros y mapeos ({rubros.length})
        </button>
      </nav>

      {error && (
        <div className="alert error" onClick={() => setError("")}>
          {error}
        </div>
      )}

      {tab === "generar" ? (
        <Generar e3={e3} rubros={rubros} ajustes={ajustes} setAjustes={setAjustes} irARubros={() => setTab("rubros")} />
      ) : (
        <Rubros e3={e3} rubros={rubros} recargar={recargarRubros} />
      )}
    </div>
  );
}
