"use client";

import { useMemo, useState } from "react";
import type { Ajustes, ProductoE3, Rubro } from "@/lib/types";
import { generarFila, validarImagenes, type FilaGenerada } from "@/lib/generar";
import { contadoWebPorSku } from "@/lib/precios";
import { descargarXlsx } from "@/lib/excel";
import { buscarPorSkus, guardarAjustes, normSku } from "@/lib/datos";
import { norm } from "@/lib/texto";

interface Props {
  rubros: Rubro[];
  ajustes: Ajustes;
  setAjustes: (a: Ajustes) => void;
  baseVacia: boolean;
  irA: (tab: "rubros" | "base") => void;
}

/** SKUs pegados (uno por renglón, o separados por espacio, coma o punto y coma), sin repetir y en orden. */
const AUTO = "__auto__";

const clave = (sku: string, slot: number) => `${sku}|${slot}`;

type FilaEditada = Omit<FilaGenerada, "atributos"> & {
  atributos: (FilaGenerada["atributos"][number] & { manual: boolean })[];
  titulo: string;
  tituloEditado: boolean;
};

const MAX_TITULO = 70;

function parsearSkus(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map(normSku).filter(Boolean))];
}

export default function Generar({ rubros, ajustes, setAjustes, baseVacia, irA }: Props) {
  const [rubroId, setRubroId] = useState("");
  const [textoSkus, setTextoSkus] = useState("");
  const [buscados, setBuscados] = useState<string[]>([]);
  const [productos, setProductos] = useState<ProductoE3[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [contadoWeb, setContadoWeb] = useState<Map<string, number> | null>(null);
  const [fallidas, setFallidas] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verAjustes, setVerAjustes] = useState(false);
  /** Atributos cambiados a mano en la vista previa: clave "sku|slot" -> valor. */
  const [manuales, setManuales] = useState<Record<string, string>>({});
  /** Títulos cambiados a mano: sku -> título. */
  const [titulos, setTitulos] = useState<Record<string, string>>({});

  const rubro = rubros.find((r) => r.id === rubroId) ?? null;
  const pegados = useMemo(() => parsearSkus(textoSkus), [textoSkus]);

  const faltantes = useMemo(() => {
    const hay = new Set(productos.map((p) => normSku(p.sku)));
    return buscados.filter((s) => !hay.has(s));
  }, [productos, buscados]);

  const fueraDelRubro = useMemo(() => {
    if (!rubro?.categorias?.length) return [];
    return productos.filter((p) => !rubro.categorias.includes(p.categoria)).map((p) => p.sku);
  }, [productos, rubro]);

  const filas: FilaEditada[] = useMemo(() => {
    if (!rubro) return [];
    const cw = ajustes.fuentePrecio === "firebase" ? contadoWeb : null;
    const columna = rubro.atributos.map((a) =>
      rubro.headers.findIndex((h) => Number(norm(h).match(/^atributo (\d+)/)?.[1]) === a.slot),
    );
    const colTitulo = rubro.headers.findIndex((h) => norm(h) === "titulo");
    return productos.map((p) => {
      const f = generarFila(p, rubro, ajustes, cw);
      const valores = [...f.valores];
      const titulo = titulos[f.sku] ?? p.nombre;
      let avisos = f.avisos;
      if (titulos[f.sku] !== undefined) {
        if (colTitulo >= 0) valores[colTitulo] = titulo;
        avisos = avisos.filter((a) => !a.startsWith("Título de "));
        if (titulo.length > MAX_TITULO) avisos = [`Título de ${titulo.length} caracteres (máx. ${MAX_TITULO})`, ...avisos];
      }
      const atributos = f.atributos.map((a, i) => {
        const manual = manuales[clave(f.sku, rubro.atributos[i].slot)];
        if (manual === undefined) return { ...a, manual: false };
        if (columna[i] >= 0) valores[columna[i]] = manual;
        return { ...a, valor: manual, manual: true };
      });
      return { ...f, valores, atributos, avisos, titulo, tituloEditado: titulos[f.sku] !== undefined };
    });
  }, [productos, rubro, ajustes, contadoWeb, manuales, titulos]);

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    if (!q) return filas;
    return filas.filter((f, i) => norm(f.sku + " " + productos[i].nombre).includes(q));
  }, [filas, productos, busqueda]);

  const incluidas = filas.filter((f) => !excluidos.has(f.sku));
  const conAvisos = incluidas.filter(
    (f) => f.avisos.length || f.atributos.some((a) => !a.manual && a.estado !== "ok" && a.estado !== "vacio"),
  ).length;
  const cantidadManuales = Object.keys(manuales).length + Object.keys(titulos).length;

  function editarAtributo(skus: string[], slot: number, valor: string | null) {
    setManuales((m) => {
      const n = { ...m };
      for (const sku of skus) {
        if (valor === null) delete n[clave(sku, slot)];
        else n[clave(sku, slot)] = valor;
      }
      return n;
    });
  }

  function cambiar<K extends keyof Ajustes>(k: K, v: Ajustes[K]) {
    setAjustes({ ...ajustes, [k]: v });
  }

  async function buscar() {
    setBuscando(true);
    setEstado("");
    try {
      const encontrados = await buscarPorSkus(pegados);
      const orden = new Map(pegados.map((s, i) => [s, i]));
      encontrados.sort((a, b) => (orden.get(normSku(a.sku)) ?? 0) - (orden.get(normSku(b.sku)) ?? 0));
      setProductos(encontrados);
      setBuscados(pegados);
      setExcluidos(new Set());
      setManuales({});
      setTitulos({});
      setContadoWeb(null);
      setFallidas(new Set());
    } catch (e) {
      setEstado("No pude buscar los productos: " + (e as Error).message);
    } finally {
      setBuscando(false);
    }
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

  if (baseVacia) {
    return (
      <div className="card empty">
        La base de productos está vacía.{" "}
        <button className="link" onClick={() => irA("base")}>
          Importá el export de Productos E3
        </button>{" "}
        para empezar.
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card grid2">
        <div className="field">
          <span className="label">SKUs para el archivo</span>
          <textarea
            rows={6}
            placeholder={"Pegá la lista de SKUs, uno por renglón (también sirve copiar una columna del Excel).\nCE-14L-GN\nTEP60D-1\n…"}
            value={textoSkus}
            onChange={(e) => setTextoSkus(e.target.value)}
          />
          <div className="inline">
            <button className="btn primary" disabled={!pegados.length || buscando} onClick={buscar}>
              {buscando ? "Buscando…" : `Buscar ${pegados.length || ""} SKU${pegados.length === 1 ? "" : "s"}`}
            </button>
            {buscados.length > 0 && (
              <span className="muted small">
                {productos.length} de {buscados.length} encontrados en la base
              </span>
            )}
          </div>
          {faltantes.length > 0 && (
            <span className="small warn-text">
              No están en la base ({faltantes.length}): {faltantes.slice(0, 30).join(", ")}
              {faltantes.length > 30 ? "…" : ""}
            </span>
          )}
        </div>
        <div className="field">
          <span className="label">Rubro</span>
          {rubros.length ? (
            <select
              value={rubroId}
              onChange={(e) => {
                setRubroId(e.target.value);
                setManuales({});
              }}
            >
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
              <button className="link" onClick={() => irA("rubros")}>
                Crear uno desde una plantilla de cyber
              </button>
            </p>
          )}
          {fueraDelRubro.length > 0 && (
            <span className="small warn-text">
              {fueraDelRubro.length} SKU no son de las categorías del rubro: {fueraDelRubro.slice(0, 15).join(", ")}
              {fueraDelRubro.length > 15 ? "…" : ""}
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
              <span className="label">+ % sobre el contado</span>
              <input
                type="number"
                value={ajustes.porcentajeOferta}
                onChange={(e) => cambiar("porcentajeOferta", Number(e.target.value))}
              />
              {ajustes.fuentePrecio === "firebase" && (
                <button className="btn small" disabled={ocupado || !productos.length} onClick={traerFirebase}>
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
                <option value="porcentaje">% sobre el precio en oferta</option>
              </select>
              {ajustes.precioAnterior === "porcentaje" && (
                <input
                  type="number"
                  value={ajustes.porcentajeAnterior}
                  onChange={(e) => cambiar("porcentajeAnterior", Number(e.target.value))}
                />
              )}
            </label>
            <label className="field">
              <span className="label">Decimales del precio sin impuestos</span>
              <input
                type="number"
                min={0}
                max={6}
                value={ajustes.decimalesSinImpuestos}
                onChange={(e) => cambiar("decimalesSinImpuestos", Number(e.target.value))}
              />
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
              Precio en oferta = contado + {ajustes.porcentajeOferta}%.{" "}
              {ajustes.precioAnterior === "porcentaje" ? `Precio anterior = oferta + ${ajustes.porcentajeAnterior}%. ` : ""}
              Precio sin impuestos = oferta / (1 + Impuestos del E3)

              {ajustes.decimalesSinImpuestos > 0
                ? `, con ${ajustes.decimalesSinImpuestos} decimales.`
                : ", redondeado a entero."} Precios redondeados para terminar en 9. Los
              SKU terminados en -1 usan siempre el precio del E3. Los ajustes se guardan al descargar.
            </p>
          </div>
        )}
      </div>

      {rubro && productos.length > 0 && (
        <>
          <div className="toolbar">
            <span>
              <strong>{incluidas.length}</strong> de {filas.length} productos ·{" "}
              <span className={conAvisos ? "warn-text" : ""}>{conAvisos} para revisar</span>
              {cantidadManuales > 0 && (
                <>
                  {" "}
                  · {cantidadManuales} {cantidadManuales === 1 ? "dato editado" : "datos editados"} a mano{" "}
                  <button
                    className="link"
                    onClick={() => {
                      setManuales({});
                      setTitulos({});
                    }}
                  >
                    deshacer
                  </button>
                </>
              )}
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
                    <th key={a.slot}>
                      <div>{a.nombre}</div>
                      <select
                        className="todos"
                        value=""
                        title="Cambia este atributo en todos los productos visibles"
                        onChange={(e) => {
                          const v = e.target.value;
                          editarAtributo(
                            visibles.filter((f) => !excluidos.has(f.sku)).map((f) => f.sku),
                            a.slot,
                            v === AUTO ? null : v,
                          );
                        }}
                      >
                        <option value="">Poner a todos…</option>
                        <option value={AUTO}>(automático)</option>
                        {a.opciones.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </th>
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
                      <td className={`titulo ${f.titulo.length > MAX_TITULO ? "largo" : ""} ${f.tituloEditado ? "editado" : ""}`}>
                        <textarea
                          rows={f.titulo.length > 45 ? 2 : 1}
                          value={f.titulo}
                          onChange={(e) =>
                            setTitulos((t) => {
                              const n = { ...t };
                              if (e.target.value === productos.find((p) => p.sku === f.sku)?.nombre) delete n[f.sku];
                              else n[f.sku] = e.target.value;
                              return n;
                            })
                          }
                        />
                        <div className="contador small">
                          {f.titulo.length}/{MAX_TITULO}
                          {f.tituloEditado && (
                            <>
                              {" · "}
                              <button
                                className="link"
                                onClick={() =>
                                  setTitulos((t) => {
                                    const n = { ...t };
                                    delete n[f.sku];
                                    return n;
                                  })
                                }
                              >
                                volver al del E3
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="num">{col("precio anterior")}</td>
                      <td className="num">{col("precio en oferta")}</td>
                      <td className="num">{col("precio sin impuestos")}</td>
                      {f.atributos.map((a, i) => {
                        const atr = rubro.atributos[i];
                        const opciones =
                          a.valor && !atr.opciones.includes(a.valor) ? [a.valor, ...atr.opciones] : atr.opciones;
                        return (
                          <td
                            key={i}
                            className={`attr ${a.manual ? "manual" : a.estado}`}
                            title={
                              (a.manual ? "Editado a mano. " : "") +
                              (a.origen ? `Del E3: ${a.origen}` : "Sin dato en el E3")
                            }
                          >
                            {opciones.length ? (
                              <select
                                value={a.valor}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  editarAtributo([f.sku], atr.slot, v === AUTO ? null : v);
                                }}
                              >
                                {a.manual && <option value={AUTO}>(volver al automático)</option>}
                                <option value="">—</option>
                                {opciones.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={a.valor}
                                onChange={(e) => editarAtributo([f.sku], atr.slot, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
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
            <span className="attr sin-coincidencia pill">sin coincidencia</span> no se encontró valor ·{" "}
            <span className="attr manual pill">editado</span> cambiado a mano. Cambiá cualquier atributo desde su
            celda, o en todos los visibles con &quot;Poner a todos…&quot; (sirve combinado con el buscador). Los
            cambios a mano valen solo para este archivo; para que queden, ajustá las reglas en &quot;Rubros y
            mapeos&quot;.
          </p>
        </>
      )}
      {!rubro && productos.length > 0 && <div className="alert">Elegí el rubro para ver la vista previa.</div>}
      {estado && !(rubro && productos.length > 0) && <div className="alert">{estado}</div>}
    </div>
  );
}
