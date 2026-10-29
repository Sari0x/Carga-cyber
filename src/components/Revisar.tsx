"use client";

import { useMemo, useState } from "react";
import { contadoWebPorSku } from "@/lib/precios";
import {
  actualizarXlsx,
  calcularPrecios,
  COLUMNAS,
  descargarBytes,
  FORMULA_DEFAULT,
  iguales,
  leerPlanillaPrecios,
  type Columna,
  type Formula,
  type PlanillaPrecios,
  type Precios,
} from "@/lib/revisar";
import { norm, skuFirebase } from "@/lib/texto";

type Estado = "igual" | "cambio" | "recalculo" | "sin-precio";

const TITULOS: Record<Columna, string> = {
  web: "Web",
  anterior: "Anterior",
  oferta: "Oferta",
  sinImpuesto: "Sin imp.",
};

const ETIQUETA: Record<Estado, string> = {
  igual: "Sin cambios",
  cambio: "Cambió el precio web",
  recalculo: "Mal calculado",
  "sin-precio": "No está en Firebase",
};

const pesos = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export default function Revisar() {
  const [planilla, setPlanilla] = useState<PlanillaPrecios | null>(null);
  const [formula, setFormula] = useState<Formula>(FORMULA_DEFAULT);
  const [contadoWeb, setContadoWeb] = useState<Map<string, number> | null>(null);
  const [soloCambios, setSoloCambios] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const filas = useMemo(() => {
    if (!planilla) return [];
    return planilla.filas.map((f) => {
      const web = contadoWeb?.get(skuFirebase(f.sku));
      const nuevo: Precios | null = web ? calcularPrecios(web, f.iva, formula) : null;
      // Solo se comparan las columnas que tiene la planilla.
      const distintas = nuevo
        ? COLUMNAS.filter((k) => planilla.letras[k] && !iguales(f.actual[k], nuevo[k]))
        : [];
      const est: Estado = !nuevo
        ? "sin-precio"
        : distintas.includes("web")
          ? "cambio"
          : distintas.length
            ? "recalculo"
            : "igual";
      return { ...f, nuevo, distintas, estado: est };
    });
  }, [planilla, contadoWeb, formula]);

  const cuenta = (e: Estado) => filas.filter((f) => f.estado === e).length;
  const aActualizar = filas.filter((f) => f.nuevo && f.distintas.length);

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    return filas.filter(
      (f) =>
        (!soloCambios || f.estado !== "igual") && (!q || norm(`${f.sku} ${f.rubro} ${f.subrubro}`).includes(q)),
    );
  }, [filas, soloCambios, busqueda]);

  async function abrir(file: File) {
    setEstado("");
    setContadoWeb(null);
    try {
      const p = await leerPlanillaPrecios(file);
      setPlanilla(p);
      const faltan = COLUMNAS.filter((k) => !p.letras[k]).map((k) => TITULOS[k]);
      setEstado(
        `${p.filas.length} SKU en la hoja "${p.hoja}".` +
          (faltan.length ? ` No encontré las columnas: ${faltan.join(", ")} (no se revisan).` : ""),
      );
      await consultar(p);
    } catch (e) {
      setPlanilla(null);
      setEstado((e as Error).message);
    }
  }

  async function consultar(p: PlanillaPrecios) {
    setOcupado(true);
    try {
      const mapa = await contadoWebPorSku(
        p.filas.map((f) => f.sku),
        (h, t) => setEstado(`Consultando precios en Firebase… ${h}/${t}`),
      );
      setContadoWeb(mapa);
      setEstado(`Precios de Firebase consultados: ${mapa.size} encontrados.`);
    } catch (e) {
      setEstado((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function descargar() {
    if (!planilla) return;
    try {
      const bytes = actualizarXlsx(
        planilla,
        aActualizar.map((f) => ({ fila: f.fila, precios: f.nuevo! })),
      );
      const fecha = new Date().toISOString().slice(0, 10);
      descargarBytes(planilla.nombreArchivo.replace(/\.xlsx?$/i, "") + ` - revisado ${fecha}.xlsx`, bytes);
    } catch (e) {
      setEstado("No pude generar el Excel: " + (e as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="card grid2">
        <div className="field">
          <span className="label">Planilla de precios (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx"
            disabled={ocupado}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) abrir(f);
              e.target.value = "";
            }}
          />
          <span className="muted small">
            Tiene que tener las columnas SKU y PRECIO WEB; también se revisan PRECIO ANTERIOR, PRECIO OFERTA, IVA
            y PRECIO SIN IMPUESTO si están. El resto del archivo (rubros, destacados, colores) queda igual.
          </span>
          {planilla && (
            <div className="inline">
              <span className="muted small">{planilla.nombreArchivo}</span>
              <button className="btn small" disabled={ocupado} onClick={() => consultar(planilla)}>
                Volver a consultar Firebase
              </button>
            </div>
          )}
        </div>
        <div className="ajustes">
          <label className="field">
            <span className="label">Oferta = web + %</span>
            <input
              type="number"
              value={formula.porcentajeOferta}
              onChange={(e) => setFormula({ ...formula, porcentajeOferta: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="label">Anterior = oferta + %</span>
            <input
              type="number"
              value={formula.porcentajeAnterior}
              onChange={(e) => setFormula({ ...formula, porcentajeAnterior: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="label">Decimales sin impuesto</span>
            <input
              type="number"
              min={0}
              max={6}
              value={formula.decimalesSinImpuesto}
              onChange={(e) => setFormula({ ...formula, decimalesSinImpuesto: Number(e.target.value) })}
            />
          </label>
          <p className="muted small wide">
            Web = contadoWeb de Firebase. Oferta y anterior redondeados a entero. Sin impuesto = (web +{" "}
            {formula.porcentajeOferta}%, sin redondear) / (1 + IVA de la planilla).
          </p>
        </div>
      </div>

      {estado && <div className="alert">{estado}</div>}

      {planilla && contadoWeb && (
        <>
          <div className="toolbar">
            <span>
              <strong>{filas.length}</strong> SKU · <span className="precio cambio pill">{cuenta("cambio")} cambiaron</span>{" "}
              <span className="precio recalculo pill">{cuenta("recalculo")} mal calculados</span>{" "}
              <span className="precio sin-precio pill">{cuenta("sin-precio")} sin precio</span>{" "}
              <span className="muted">{cuenta("igual")} sin cambios</span>
            </span>
            <label className="inline small">
              <input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
              Solo los que no están bien
            </label>
            <input placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <button className="btn primary" disabled={!aActualizar.length} onClick={descargar}>
              Descargar Excel actualizado ({aActualizar.length})
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Fila</th>
                  <th>Subrubro</th>
                  <th>SKU</th>
                  <th>Estado</th>
                  {COLUMNAS.filter((k) => planilla.letras[k]).map((k) => (
                    <th key={k} className="num">
                      {TITULOS[k]}
                    </th>
                  ))}
                  <th className="num">Dif. web</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const dif = f.nuevo && f.actual.web ? (f.nuevo.web - f.actual.web) / f.actual.web : 0;
                  return (
                    <tr key={f.fila}>
                      <td className="num muted">{f.fila}</td>
                      <td className="small">{f.subrubro || f.rubro}</td>
                      <td className="mono">{f.sku}</td>
                      <td>
                        <span className={`precio ${f.estado} pill`}>{ETIQUETA[f.estado]}</span>
                      </td>
                      {COLUMNAS.filter((k) => planilla.letras[k]).map((k) => (
                        <td key={k} className={`num ${f.distintas.includes(k) ? "precio cambio" : ""}`}>
                          {f.distintas.includes(k) ? (
                            <>
                              <div className="tachado">{pesos(f.actual[k])}</div>
                              <strong>{pesos(f.nuevo![k])}</strong>
                            </>
                          ) : (
                            pesos(f.actual[k])
                          )}
                        </td>
                      ))}
                      <td className={`num ${dif > 0 ? "bad-text" : dif < 0 ? "ok-text" : "muted"}`}>
                        {f.estado === "cambio"
                          ? `${dif > 0 ? "+" : ""}${(dif * 100).toFixed(1)}% (${dif > 0 ? "+" : ""}${pesos(f.nuevo!.web - f.actual.web)})`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!visibles.length && (
                  <tr>
                    <td colSpan={9} className="muted">
                      Todos los precios están al día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Los precios tachados son los de la planilla y debajo el que corresponde hoy. &quot;Mal calculado&quot;:
            el precio web está bien pero anterior, oferta o sin impuesto no dan con la fórmula. Al descargar se
            corrigen solo esas celdas; las que tienen fórmula la conservan y Excel las recalcula al abrir.
          </p>
        </>
      )}
    </div>
  );
}
