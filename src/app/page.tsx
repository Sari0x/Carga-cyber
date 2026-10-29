"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Generar from "@/components/Generar";
import Rubros from "@/components/Rubros";
import Base from "@/components/Base";
import Revisar from "@/components/Revisar";
import { guardarAjustes, leerAjustes, listarRubros, resumenBase } from "@/lib/datos";
import { AJUSTES_DEFAULT, type Ajustes, type Rubro } from "@/lib/types";

type Tab = "generar" | "revisar" | "rubros" | "base";

export default function Home() {
  const [tab, setTab] = useState<Tab>("generar");
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_DEFAULT);
  const [base, setBase] = useState<{ total: number; actualizado: string | null } | null>(null);
  const [error, setError] = useState("");

  const recargarRubros = useCallback(async () => {
    try {
      setRubros(await listarRubros());
    } catch (e) {
      setError("No pude leer los rubros: " + (e as Error).message);
    }
  }, []);

  const recargarBase = useCallback(async () => {
    try {
      setBase(await resumenBase());
    } catch (e) {
      setError("No pude leer la base de productos: " + (e as Error).message);
    }
  }, []);

  useEffect(() => {
    recargarRubros();
    recargarBase();
    leerAjustes()
      .then(setAjustes)
      .catch((e) => setError("No pude leer los ajustes: " + (e as Error).message));
  }, [recargarRubros, recargarBase]);

  // Guarda cada cambio de ajustes (con una pausa corta para no escribir por cada tecla),
  // así al recargar la página queda la última configuración usada.
  const guardado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cambiarAjustes = useCallback((a: Ajustes) => {
    setAjustes(a);
    if (guardado.current) clearTimeout(guardado.current);
    guardado.current = setTimeout(() => {
      guardarAjustes(a).catch((e) => setError("No pude guardar los ajustes: " + (e as Error).message));
    }, 400);
  }, []);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Carga Cyber</h1>
          <p className="muted">Genera los Excel de megaofertas a partir de la base de productos E3.</p>
        </div>
        <span className="muted small">
          {base === null
            ? "Leyendo base…"
            : `Base: ${base.total} productos${
                base.actualizado ? ` · actualizada ${new Date(base.actualizado).toLocaleString("es-AR")}` : ""
              }`}
        </span>
      </header>

      <nav className="tabs">
        <button className={tab === "generar" ? "on" : ""} onClick={() => setTab("generar")}>
          Generar archivo
        </button>
        <button className={tab === "revisar" ? "on" : ""} onClick={() => setTab("revisar")}>
          Revisar precios
        </button>
        <button className={tab === "rubros" ? "on" : ""} onClick={() => setTab("rubros")}>
          Rubros y mapeos ({rubros.length})
        </button>
        <button className={tab === "base" ? "on" : ""} onClick={() => setTab("base")}>
          Base de productos
        </button>
      </nav>

      {error && (
        <div className="alert error" onClick={() => setError("")}>
          {error}
        </div>
      )}

      {tab === "generar" && (
        <Generar
          rubros={rubros}
          ajustes={ajustes}
          setAjustes={cambiarAjustes}
          baseVacia={base?.total === 0}
          irA={setTab}
        />
      )}
      {tab === "revisar" && <Revisar />}
      {tab === "rubros" && <Rubros rubros={rubros} recargar={recargarRubros} />}
      {tab === "base" && <Base resumen={base} recargar={recargarBase} />}
    </div>
  );
}
