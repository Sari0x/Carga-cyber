"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArchivoE3, Atributo, ProductoE3, Rango, Regla, ReglaTipo, Rubro } from "@/lib/types";
import { rangoDeOpcion, resolver, sugerirRegla, valoresDistintos } from "@/lib/mapeo";
import { columnasDe, guardarRubro, listarCategorias, productosDeCategorias } from "@/lib/datos";
import { norm } from "@/lib/texto";

interface Props {
  rubro: Rubro;
  volver: () => void;
  recargar: () => Promise<void>;
}

const TIPOS: { v: ReglaTipo; label: string; ayuda: string }[] = [
  { v: "mapa", label: "Mapeo de valores", ayuda: "Cada valor del campo del E3 se traduce a una opción del cyber." },
  { v: "contiene", label: "Palabra clave", ayuda: "Si el texto (por ejemplo Nombre o Url) contiene la palabra, usa la opción." },
  { v: "rango", label: "Rango numérico", ayuda: 'Toma el número del campo ("60 Lts" → 60) y lo ubica en un rango.' },
  { v: "fijo", label: "Valor fijo", ayuda: "Siempre la misma opción para todo el rubro." },
  { v: "vacio", label: "Dejar vacío", ayuda: "No completa el atributo." },
];

export default function EditorRubro({ rubro, volver, recargar }: Props) {
  const [nombre, setNombre] = useState(rubro.nombre);
  const [atributos, setAtributos] = useState<Atributo[]>(rubro.atributos);
  const [categorias, setCategorias] = useState<string[]>(rubro.categorias ?? []);
  const [todas, setTodas] = useState<{ categoria: string; cantidad: number }[]>([]);
  const [filtroCat, setFiltroCat] = useState("");
  const [productos, setProductos] = useState<ProductoE3[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<number>(rubro.atributos[0]?.slot ?? 0);
  const [estado, setEstado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    listarCategorias()
      .then(setTodas)
      .catch((e) => setEstado("No pude leer las categorías: " + (e as Error).message));
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    productosDeCategorias(categorias)
      .then((p) => vigente && setProductos(p))
      .catch((e) => vigente && setEstado("No pude leer los productos: " + (e as Error).message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [categorias]);

  const muestra: ArchivoE3 | null = useMemo(
    () => (productos.length ? { nombreArchivo: "base", headers: columnasDe(productos), productos } : null),
    [productos],
  );

  const categoriasVisibles = useMemo(() => {
    const q = norm(filtroCat);
    return todas.filter((c) => c.categoria && (categorias.includes(c.categoria) || !q || norm(c.categoria).includes(q)));
  }, [todas, filtroCat, categorias]);

  function alternarCategoria(c: string) {
    setCategorias(categorias.includes(c) ? categorias.filter((x) => x !== c) : [...categorias, c].sort());
    setSucio(true);
  }

  function setRegla(slot: number, regla: Regla) {
    setAtributos(atributos.map((a) => (a.slot === slot ? { ...a, regla } : a)));
    setSucio(true);
  }

  function sugerirTodas() {
    if (!muestra) return;
    if (
      atributos.some((a) => a.regla.tipo !== "vacio") &&
      !window.confirm("Esto reemplaza las reglas de todos los atributos por las sugeridas. ¿Seguir?")
    )
      return;
    setAtributos(atributos.map((a) => ({ ...a, regla: sugerirRegla(a, muestra.headers, muestra.productos) })));
    setSucio(true);
  }

  async function guardar() {
    setGuardando(true);
    try {
      await guardarRubro({ ...rubro, nombre: nombre.trim() || rubro.nombre, atributos, categorias });
      await recargar();
      setSucio(false);
      setEstado("Guardado.");
    } catch (e) {
      setEstado("Error al guardar: " + (e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  function salir() {
    if (sucio && !window.confirm("Hay cambios sin guardar. ¿Salir igual?")) return;
    volver();
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <button className="btn" onClick={salir}>
          ← Rubros
        </button>
        <input
          className="grow"
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setSucio(true);
          }}
        />
        <button className="btn primary" disabled={guardando || !sucio} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {estado && <div className="alert">{estado}</div>}

      <div className="card">
        <h2>Categorías del rubro</h2>
        <p className="muted small">
          Elegí de qué categorías de la tienda salen los productos de este rubro. Se usan para sugerir las reglas,
          ver qué valores aparecen en la base y avisar si pegás un SKU de otra categoría.
        </p>
        <input placeholder="Filtrar categorías, ej. termotanques" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} />
        <div className="cats">
          {categoriasVisibles.map((c) => (
            <label key={c.categoria} className={categorias.includes(c.categoria) ? "on" : ""}>
              <input
                type="checkbox"
                checked={categorias.includes(c.categoria)}
                onChange={() => alternarCategoria(c.categoria)}
              />
              {c.categoria} <span className="muted">({c.cantidad})</span>
            </label>
          ))}
          {!todas.length && <span className="muted small">La base de productos está vacía.</span>}
        </div>
        <div className="inline top-gap">
          <span className="muted small">
            {cargando ? "Cargando productos…" : `${productos.length} productos de la base en estas categorías.`}
          </span>
          <button className="btn" disabled={!muestra || cargando} onClick={sugerirTodas}>
            Sugerir todas las reglas
          </button>
        </div>
      </div>

      {atributos.map((a) => (
        <EditorAtributo
          key={a.slot}
          atributo={a}
          e3={muestra}
          abierto={abierto === a.slot}
          abrir={() => setAbierto(abierto === a.slot ? 0 : a.slot)}
          setRegla={(r) => setRegla(a.slot, r)}
        />
      ))}
    </div>
  );
}

function EditorAtributo({
  atributo,
  e3,
  abierto,
  abrir,
  setRegla,
}: {
  atributo: Atributo;
  e3: ArchivoE3 | null;
  abierto: boolean;
  abrir: () => void;
  setRegla: (r: Regla) => void;
}) {
  const r = atributo.regla;
  const productos = useMemo(() => e3?.productos ?? [], [e3]);
  const headers = e3?.headers ?? [];
  const [nuevaFuente, setNuevaFuente] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");

  const resumen = useMemo(() => {
    const c = { ok: 0, revisar: 0, "sin-coincidencia": 0, vacio: 0 };
    for (const p of productos) c[resolver(atributo, p).estado]++;
    return c;
  }, [atributo, productos]);

  const distintos = useMemo(
    () => (r.tipo === "mapa" || r.tipo === "rango" ? valoresDistintos(productos, r.fuentes) : []),
    [productos, r.tipo, r.fuentes],
  );

  const set = (cambios: Partial<Regla>) => setRegla({ ...r, ...cambios });

  function cambiarTipo(tipo: ReglaTipo) {
    const extra: Partial<Regla> = { tipo };
    if (tipo === "rango" && !r.rangos.length) {
      extra.rangos = atributo.opciones.map(rangoDeOpcion).filter((x): x is Rango => x !== null);
    }
    set(extra);
  }

  function setMapa(clave: string, valor: string) {
    const mapa = { ...r.mapa };
    if (valor) mapa[clave] = valor;
    else delete mapa[clave];
    set({ mapa });
  }

  const opcionesSelect = (valor: string, onChange: (v: string) => void, vacio = "(sin asignar)") => (
    <select value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vacio}</option>
      {atributo.opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className="card">
      <button className="attr-head" onClick={abrir}>
        <span>
          {abierto ? "▾" : "▸"} <strong>Atributo {atributo.slot}: {atributo.nombre}</strong>{" "}
          <span className="muted small">
            {TIPOS.find((t) => t.v === r.tipo)?.label}
            {r.fuentes.length ? ` · ${r.fuentes.join(", ")}` : ""}
          </span>
        </span>
        {productos.length > 0 && (
          <span className="small">
            <span className="attr ok pill">{resumen.ok}</span>{" "}
            <span className="attr revisar pill">{resumen.revisar}</span>{" "}
            <span className="attr sin-coincidencia pill">{resumen["sin-coincidencia"]}</span>
          </span>
        )}
      </button>

      {abierto && (
        <div className="attr-body">
          <div className="grid2">
            <label className="field">
              <span className="label">Tipo de regla</span>
              <select value={r.tipo} onChange={(e) => cambiarTipo(e.target.value as ReglaTipo)}>
                {TIPOS.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="muted small">{TIPOS.find((t) => t.v === r.tipo)?.ayuda}</span>
            </label>
            {r.tipo !== "fijo" && r.tipo !== "vacio" && (
              <label className="field">
                <span className="label">Si no coincide, usar</span>
                {opcionesSelect(r.sinCoincidencia, (v) => set({ sinCoincidencia: v }), "(dejar vacío)")}
              </label>
            )}
          </div>

          {r.tipo === "fijo" && (
            <label className="field">
              <span className="label">Valor</span>
              {opcionesSelect(r.fijo, (v) => set({ fijo: v }))}
            </label>
          )}

          {r.tipo !== "fijo" && r.tipo !== "vacio" && (
            <div className="field">
              <span className="label">Campos del E3 (en orden de prioridad)</span>
              <div className="chips">
                {r.fuentes.map((f) => (
                  <span key={f} className="chip">
                    {f}
                    <button onClick={() => set({ fuentes: r.fuentes.filter((x) => x !== f) })}>×</button>
                  </span>
                ))}
              </div>
              <div className="inline">
                <input
                  list={`campos-${atributo.slot}`}
                  placeholder="Agregar campo, ej. Ficha: Color"
                  value={nuevaFuente}
                  onChange={(e) => setNuevaFuente(e.target.value)}
                />
                <datalist id={`campos-${atributo.slot}`}>
                  {headers.map((h) => (
                    <option key={h} value={h} />
                  ))}
                </datalist>
                <button
                  className="btn"
                  disabled={!nuevaFuente.trim() || r.fuentes.includes(nuevaFuente.trim())}
                  onClick={() => {
                    set({ fuentes: [...r.fuentes, nuevaFuente.trim()] });
                    setNuevaFuente("");
                  }}
                >
                  Agregar
                </button>
                {headers.length > 0 && (
                  <button className="btn" onClick={() => setRegla(sugerirRegla(atributo, headers, productos))}>
                    Sugerir regla
                  </button>
                )}
              </div>
            </div>
          )}

          {r.tipo === "mapa" && (
            <div className="field">
              <span className="label">Valores del E3 → opción del cyber</span>
              {distintos.length === 0 && (
                <p className="muted small">
                  {e3 ? "Ningún producto tiene valor en esos campos." : "Elegí las categorías del rubro para ver los valores de la base."}
                </p>
              )}
              <table className="mini">
                <tbody>
                  {distintos.map((d) => {
                    const clave = norm(d.valor);
                    const auto = resolver({ ...atributo, regla: { ...r, mapa: {} } }, {
                      ...productos[0],
                      campos: Object.fromEntries(r.fuentes.slice(0, 1).map((f) => [f, d.valor])),
                    });
                    return (
                      <tr key={clave}>
                        <td>{d.valor}</td>
                        <td className="muted small num">{d.cantidad}</td>
                        <td>{opcionesSelect(r.mapa[clave] ?? "", (v) => setMapa(clave, v), auto.valor ? `auto: ${auto.valor}` : "(sin asignar)")}</td>
                      </tr>
                    );
                  })}
                  {Object.keys(r.mapa)
                    .filter((k) => !distintos.some((d) => norm(d.valor) === k))
                    .map((k) => (
                      <tr key={k} className="muted">
                        <td>{k} (no está en este E3)</td>
                        <td></td>
                        <td>{opcionesSelect(r.mapa[k], (v) => setMapa(k, v))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {r.tipo === "contiene" && (
            <div className="field">
              <span className="label">Palabra clave → opción (se prueban en orden)</span>
              <table className="mini">
                <tbody>
                  {Object.entries(r.mapa).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{opcionesSelect(v, (nv) => setMapa(k, nv), "(quitar)")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="inline">
                <input placeholder="ej. termotanque" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} />
                <button
                  className="btn"
                  disabled={!norm(nuevaClave)}
                  onClick={() => {
                    setMapa(norm(nuevaClave), atributo.opciones[0] ?? "");
                    setNuevaClave("");
                  }}
                >
                  Agregar palabra
                </button>
              </div>
              <span className="muted small">
                Si ninguna palabra coincide, busca el nombre de cada opción dentro del texto y lo marca para revisar.
              </span>
            </div>
          )}

          {r.tipo === "rango" && (
            <div className="field">
              <span className="label">Rangos (desde – hasta → opción)</span>
              <table className="mini">
                <tbody>
                  {r.rangos.map((x, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="number"
                          value={x.min}
                          onChange={(e) =>
                            set({ rangos: r.rangos.map((y, j) => (j === i ? { ...y, min: Number(e.target.value) } : y)) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={x.max >= Number.MAX_SAFE_INTEGER ? "" : x.max}
                          placeholder="sin tope"
                          onChange={(e) =>
                            set({
                              rangos: r.rangos.map((y, j) =>
                                j === i
                                  ? { ...y, max: e.target.value === "" ? Number.MAX_SAFE_INTEGER : Number(e.target.value) }
                                  : y,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        {opcionesSelect(x.valor, (v) =>
                          set({ rangos: r.rangos.map((y, j) => (j === i ? { ...y, valor: v } : y)) }),
                        )}
                      </td>
                      <td>
                        <button className="btn small" onClick={() => set({ rangos: r.rangos.filter((_, j) => j !== i) })}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="inline">
                <button
                  className="btn"
                  onClick={() => set({ rangos: [...r.rangos, { min: 0, max: Number.MAX_SAFE_INTEGER, valor: "" }] })}
                >
                  Agregar rango
                </button>
              </div>
              {distintos.length > 0 && (
                <span className="muted small">
                  Valores en el E3: {distintos.slice(0, 12).map((d) => `${d.valor} (${d.cantidad})`).join(", ")}
                </span>
              )}
            </div>
          )}

          <details className="small">
            <summary>Opciones permitidas ({atributo.opciones.length})</summary>
            <p className="muted">{atributo.opciones.join(" · ")}</p>
          </details>
        </div>
      )}
    </div>
  );
}
