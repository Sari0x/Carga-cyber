"use client";

import { useMemo, useState } from "react";
import type { Ajustes, ArchivoE3, Rubro } from "@/lib/types";
import { generarFila, validarImagenes, type FilaGenerada } from "@/lib/generar";
import { contadoWebPorSku } from "@/lib/precios";
import { descargarXlsx } from "@/lib/excel";
import { guardarAjustes } from "@/lib/datos";
import { norm } from "@/lib/texto";

interface Props {
  e3: ArchivoE3 | null;
  rubros: Rubro[];
  ajustes: Ajustes;
  setAjustes: (a: Ajustes) => void;
  irARubros: () => void;
}

function parsearSkus(texto: string): Set<string> {
  return new Set(
    texto
      .split(/[\s,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

export default function Generar({ e3, rubros, ajustes, setAjustes, irARubros }: Props) {
  const [rubroId, setRubroId] = useState("");
  const [filtroSkus, setFiltroSkus] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [contadoWeb, setContadoWeb] = useState<Map<string, number> | null>(null);
  const [fallidas, setFallidas] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verAjustes, setVerAjustes] = useState(false);

  const rubro = rubros.find((r) => r.id === rubroId) ?? null;
  const skus = useMemo(() => parsearSkus(filtroSkus), [filtroSkus]);

  const productos = useMemo(() => {
    if (!e3) return [];
    return e3.productos.filter((p) => !skus.size || skus.has(p.sku.toUpperCase()));
  }, [e3, skus]);

  const faltantes = useMemo(() => {
    if (!e3 || !skus.size) return [];
    const hay = new Set(e3.productos.map((p) => p.sku.toUpperCase()));
    return [...skus].filter((s) => !hay.has(s));
  }, [e3, skus]);

  const filas: FilaGenerada[] = useMemo(() => {
    if (!rubro) return [];
    const cw = ajustes.fuentePrecio === "firebase" ? contadoWeb : null;
    return productos.map((p) => generarFila(p, rubro, ajustes, cw));
  }, [productos, rubro, ajustes, contadoWeb]);

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    if (!q) return filas;
    return filas.filter((f, i) => norm(f.sku + " " + productos[i].nombre).includes(q));
  }, [filas, productos, busqueda]);

  const incluidas = filas.filter((f) => !excluidos.has(f.sku));
  const conAvisos = incluidas.filter(
    (f) => f.avisos.length || f.atributos.some((a) => a.estado !== "ok" && a.estado !== "vacio"),
  ).length;

  function cambiar<K extends keyof Ajustes>(k: K, v: Ajustes[K]) {
    setAjustes({ ...ajustes, [k]: v });
  }

  async function traerFirebase() {
    setOcupado(true);
    setEstado("Consultando precios en Firebase…");
    try {
      const mapa = await contadoWebPorSku(
        productos.map((p) => p.sku),
        (h, t) => setEstado(`Consultando precios en Firebase… ${h}/${t}`),
      );
      setContadoWeb(mapa);
      setEstado(`Precios de Firebase: ${mapa.size} encontrados.`);
    } catch (e) {
      setEstado((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function validar() {
    setOcupado(true);
    try {
      const urls = incluidas.flatMap((f) => f.imagenes);
      const res = await validarImagenes(urls, (h, t) => setEstado(`Validando imágenes… ${h}/${t}`));
      setFallidas(res);
      setEstado(res.size ? `${res.size} imágenes no cargan (marcadas en rojo).` : "Todas las imágenes cargan bien.");
    } finally {
      setOcupado(false);
    }
  }

  function descargar() {
    if (!rubro) return;
    const fecha = new Date().toISOString().slice(0, 10);
    const nombre = `megaofertas - ${rubro.nombre} - ${fecha}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
    descargarXlsx(nombre, rubro.headers, incluidas.map((f) => f.valores), rubro.atributos);
    guardarAjustes(ajustes).catch(() => {});
  }

  function alternar(sku: string) {
    const s = new Set(excluidos);
    if (s.has(sku)) s.delete(sku);
    else s.add(sku);
    setExcluidos(s);
  }

  if (!e3) {
    return <div className="card empty">Importá el Excel de Productos E3 arriba para empezar.</div>;
  }

  return (
    <div className="stack">
      <div className="card grid2">
        <div className="field">
          <span className="label">Rubro</span>
          {rubros.length ? (
            <select value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
              <option value="">Elegí un rubro…</option>
              {rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} ({r.atributos.length} atributos)
                </option>
              ))}
            </select>
          ) : (
            <p className="muted">
              No hay rubros todavía.{" "}
              <button className="link" onClick={irARubros}>
                Crear uno desde una plantilla de cyber
              </button>
            </p>
          )}
        </div>
        <div className="field">
          <span className="label">Filtrar por SKU (opcional)</span>
          <textarea
            rows={2}
            placeholder="Pegá SKUs separados por espacio, coma o renglón. Vacío = todos."
            value={filtroSkus}
            onChange={(e) => setFiltroSkus(e.target.value)}
          />
          {faltantes.length > 0 && (
            <span className="small warn-text">
              No están en el E3: {faltantes.slice(0, 15).join(", ")}
              {faltantes.length > 15 ? "…" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <button className="link" onClick={() => setVerAjustes(!verAjustes)}>
          {verAjustes ? "▾" : "▸"} Precios y valores fijos
        </button>
        {verAjustes && (
          <div className="ajustes">
            <label className="field">
              <span className="label">Precio en oferta</span>
              <select
                value={ajustes.fuentePrecio}
                onChange={(e) => cambiar("fuentePrecio", e.target.value as Ajustes["fuentePrecio"])}
              >
                <option value="e3">&quot;Precio&quot; del E3</option>
                <option value="firebase">contadoWeb de Firebase</option>
              </select>
              {ajustes.fuentePrecio === "firebase" && (
                <button className="btn small" disabled={ocupado} onClick={traerFirebase}>
                  {contadoWeb ? "Volver a consultar Firebase" : "Consultar Firebase"}
                </button>
              )}
            </label>
            <label className="field">
              <span className="label">Precio anterior</span>
              <select
                value={ajustes.precioAnterior}
                onChange={(e) => cambiar("precioAnterior", e.target.value as Ajustes["precioAnterior"])}
              >
                <option value="lista">&quot;Precio de Lista&quot; del E3</option>
                <option value="porcentaje">% sobre la oferta</option>
              </select>
              {ajustes.precioAnterior === "porcentaje" && (
                <input
                  type="number"
                  value={ajustes.porcentajeAnterior}
                  onChange={(e) => cambiar("porcentajeAnterior", Number(e.target.value))}
                />
              )}
            </label>
            <label className="field wide">
              <span className="label">UTM (se agrega al link)</span>
              <input value={ajustes.utm} onChange={(e) => cambiar("utm", e.target.value)} />
            </label>
            {(
              [
                ["financiacion", "Financiación (cuotas)"],
                ["ofertaActiva", "Oferta activa"],
                ["sinInteres", "Sin interés"],
                ["retiro", "Retiro en tienda"],
                ["envioPais", "Envío a todo el país"],
                ["promosBancarias", "Promociones bancarias"],
                ["internacional", "Producto internacional"],
              ] as const
            ).map(([k, label]) => (
              <label className="field" key={k}>
                <span className="label">{label}</span>
                <input type="number" value={ajustes[k]} onChange={(e) => cambiar(k, Number(e.target.value))} />
              </label>
            ))}
            <label className="field">
              <span className="label">Envío gratis</span>
              <select
                value={ajustes.envioGratis}
                onChange={(e) => cambiar("envioGratis", e.target.value as Ajustes["envioGratis"])}
              >
                <option value="0">0 (no)</option>
                <option value="1">1 (sí)</option>
                <option value="e3">Según &quot;Envío Gratuito&quot; del E3</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Unidad</span>
              <input value={ajustes.unidad} onChange={(e) => cambiar("unidad", e.target.value)} />
            </label>
            <p className="muted small wide">
              Precio sin impuestos = oferta / (1 + Impuestos del E3). Precios redondeados para terminar en 9. Los
              SKU terminados en -1 usan siempre el precio del E3. Los ajustes se guardan al descargar.
            </p>
          </div>
        )}
      </div>

      {rubro && (
        <>
          <div className="toolbar">
            <span>
              <strong>{incluidas.length}</strong> de {filas.length} productos ·{" "}
              <span className={conAvisos ? "warn-text" : ""}>{conAvisos} para revisar</span>
            </span>
            <input placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <button className="btn" disabled={ocupado || !incluidas.length} onClick={validar}>
              Validar imágenes
            </button>
            <button
              className="btn primary"
              disabled={!incluidas.length || (ajustes.fuentePrecio === "firebase" && !contadoWeb)}
              onClick={descargar}
            >
              Descargar Excel
            </button>
          </div>
          {ajustes.fuentePrecio === "firebase" && !contadoWeb && (
            <div className="alert warn">Consultá Firebase en &quot;Precios y valores fijos&quot; antes de descargar.</div>
          )}
          {estado && <div className="alert">{estado}</div>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>SKU</th>
                  <th>Título</th>
                  <th className="num">Anterior</th>
                  <th className="num">Oferta</th>
                  <th className="num">Sin imp.</th>
                  {rubro.atributos.map((a) => (
                    <th key={a.slot}>{a.nombre}</th>
                  ))}
                  <th>Imágenes</th>
                  <th>Avisos</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const col = (n: string) => f.valores[rubro.headers.findIndex((h) => norm(h).startsWith(n))];
                  return (
                    <tr key={f.sku} className={excluidos.has(f.sku) ? "off" : ""}>
                      <td>
                        <input type="checkbox" checked={!excluidos.has(f.sku)} onChange={() => alternar(f.sku)} />
                      </td>
                      <td className="mono">{f.sku}</td>
                      <td className="titulo">{col("titulo")}</td>
                      <td className="num">{col("precio anterior")}</td>
                      <td className="num">{col("precio en oferta")}</td>
                      <td className="num">{col("precio sin impuestos")}</td>
                      {f.atributos.map((a, i) => (
                        <td
                          key={i}
                          className={`attr ${a.estado}`}
                          title={a.origen ? `Del E3: ${a.origen}` : "Sin dato en el E3"}
                        >
                          {a.valor || "—"}
                        </td>
                      ))}
                      <td>
                        <div className="thumbs">
                          {f.imagenes.map((u) => (
                            <a key={u} href={u.replace(/^http:\/\/wsrv/, "https://wsrv")} target="_blank" rel="noreferrer">
                              <span className={`dot ${fallidas.has(u) ? "bad" : ""}`} />
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className="small warn-text">{f.avisos.join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Atributos: <span className="attr ok pill">ok</span> regla definida ·{" "}
            <span className="attr revisar pill">revisar</span> coincidencia aproximada ·{" "}
            <span className="attr sin-coincidencia pill">sin coincidencia</span> no se encontró valor. Pasá el mouse
            para ver el dato del E3. Ajustá las reglas en &quot;Rubros y mapeos&quot;.
          </p>
        </>
      )}
    </div>
  );
}
