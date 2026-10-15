"use client";

import { useEffect, useState } from "react";
import type { Atributo, Rubro } from "@/lib/types";
import { leerPlantilla } from "@/lib/excel";
import {
  borrarRubro,
  columnasDe,
  crearRubro,
  guardarRubro,
  listarCategorias,
  productosDeCategorias,
} from "@/lib/datos";
import { sugerirCategorias, sugerirRegla } from "@/lib/mapeo";
import { norm } from "@/lib/texto";
import EditorRubro from "./EditorRubro";

interface Props {
  rubros: Rubro[];
  recargar: () => Promise<void>;
}

type Accion = "crear" | "actualizar" | "omitir";

/** Un rubro leído de una plantilla, pendiente de importar. */
interface Pendiente {
  clave: string;
  archivo: string;
  nombre: string;
  headers: string[];
  defaults: Record<string, string>;
  atributos: Atributo[];
  categorias: string[];
  accion: Accion;
  resultado?: string;
}

export default function Rubros({ rubros, recargar }: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [fallidos, setFallidos] = useState<string[]>([]);
  const [categoriasBase, setCategoriasBase] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarCategorias()
      .then((c) => setCategoriasBase(c.map((x) => x.categoria).filter(Boolean)))
      .catch(() => {});
  }, []);

  const existente = (nombre: string) => rubros.find((r) => norm(r.nombre) === norm(nombre));

  async function leer(files: FileList) {
    setError("");
    setEstado("");
    setOcupado(true);
    const nuevos: Pendiente[] = [];
    const errores: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const p = await leerPlantilla(file);
        if (!p.ayudas.length) throw new Error('no tiene hoja "Ayuda" con los atributos');
        p.ayudas.forEach((ayuda, i) => {
          const nombre = p.ayudas.length > 1 ? `${p.nombreSugerido} - ${ayuda.hoja}` : p.nombreSugerido;
          nuevos.push({
            clave: `${file.name}#${i}`,
            archivo: file.name,
            nombre,
            headers: p.headers,
            defaults: p.defaults,
            atributos: ayuda.atributos,
            categorias: sugerirCategorias(
              [nombre, p.defaults["Subcategoria 1"] ?? "", p.defaults["Subcategoria 2"] ?? ""],
              categoriasBase,
            ),
            accion: existente(nombre) ? "actualizar" : "crear",
          });
        });
      } catch (e) {
        errores.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    // Si se repite un nombre entre los archivos, solo se importa el primero.
    const vistos = new Set<string>();
    for (const n of nuevos) {
      if (vistos.has(norm(n.nombre))) n.accion = "omitir";
      vistos.add(norm(n.nombre));
    }
    setPendientes(nuevos);
    setFallidos(errores);
    setOcupado(false);
  }

  function cambiar(clave: string, cambios: Partial<Pendiente>) {
    setPendientes((ps) =>
      ps.map((p) => {
        if (p.clave !== clave) return p;
        const n = { ...p, ...cambios };
        if (cambios.nombre !== undefined && n.accion !== "omitir") n.accion = existente(n.nombre) ? "actualizar" : "crear";
        return n;
      }),
    );
  }

  async function reglasSugeridas(p: Pendiente, categorias: string[], previas: Atributo[]): Promise<Atributo[]> {
    const productos = await productosDeCategorias(categorias);
    const headers = columnasDe(productos);
    return p.atributos.map((a) => {
      const previa = previas.find((x) => norm(x.nombre) === norm(a.nombre));
      if (previa && previa.regla.tipo !== "vacio") return { ...a, regla: previa.regla };
      return productos.length ? { ...a, regla: sugerirRegla(a, headers, productos) } : a;
    });
  }

  async function importar() {
    const aImportar = pendientes.filter((p) => p.accion !== "omitir");
    setOcupado(true);
    setError("");
    let hechos = 0;
    let ultimoId = "";
    for (const p of aImportar) {
      setEstado(`Importando ${++hechos}/${aImportar.length}: ${p.nombre}…`);
      try {
        const previo = p.accion === "actualizar" ? existente(p.nombre) : undefined;
        const categorias = p.categorias.length ? p.categorias : (previo?.categorias ?? []);
        const atributos = await reglasSugeridas(p, categorias, previo?.atributos ?? []);
        const datos = { nombre: p.nombre.trim(), headers: p.headers, defaults: p.defaults, atributos, categorias };
        if (previo) {
          await guardarRubro({ ...previo, ...datos });
          ultimoId = previo.id;
        } else {
          ultimoId = (await crearRubro(datos)).id;
        }
        cambiar(p.clave, { resultado: previo ? "actualizado" : "creado" });
      } catch (e) {
        cambiar(p.clave, { resultado: "error: " + (e as Error).message });
      }
    }
    await recargar();
    setEstado(`Listo: ${hechos} rubros importados. Revisá las reglas de cada uno con "Editar reglas".`);
    setPendientes((ps) => ps.filter((p) => p.resultado?.startsWith("error")));
    setOcupado(false);
    if (aImportar.length === 1 && ultimoId) setEditando(ultimoId);
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

  const cantidad = pendientes.filter((p) => p.accion !== "omitir").length;

  return (
    <div className="stack">
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>Importar plantillas de rubros</h2>
        <p className="muted small">
          Elegí una o varias plantillas de megaofertas a la vez (las que traen la hoja &quot;Ayuda&quot; con los
          atributos y sus valores permitidos). Para cada una la app propone las categorías de la tienda según el
          nombre del rubro y sugiere las reglas con los productos de la base. Si el rubro ya existe, actualiza la
          plantilla y conserva las reglas de los atributos que siguen igual.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          disabled={ocupado}
          onChange={(ev) => {
            if (ev.target.files?.length) leer(ev.target.files);
            ev.target.value = "";
          }}
        />
        {fallidos.length > 0 && (
          <div className="alert error top-gap">
            No pude leer {fallidos.length} archivo(s): {fallidos.join(" · ")}
          </div>
        )}
        {estado && <div className="alert top-gap">{estado}</div>}

        {pendientes.length > 0 && (
          <>
            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Nombre del rubro</th>
                    <th>Atributos</th>
                    <th>Categorías propuestas</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((p) => (
                    <tr key={p.clave} className={p.accion === "omitir" ? "off" : ""}>
                      <td className="small">{p.archivo}</td>
                      <td>
                        <input value={p.nombre} onChange={(e) => cambiar(p.clave, { nombre: e.target.value })} />
                        {p.resultado && <div className="small warn-text">{p.resultado}</div>}
                      </td>
                      <td className="small">{p.atributos.map((a) => a.nombre).join(", ")}</td>
                      <td className="small">
                        {p.categorias.length ? (
                          p.categorias.map((c) => (
                            <span key={c} className="chip">
                              {c}
                              <button onClick={() => cambiar(p.clave, { categorias: p.categorias.filter((x) => x !== c) })}>
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="warn-text">Ninguna: elegilas después en el editor</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={p.accion}
                          onChange={(e) => cambiar(p.clave, { accion: e.target.value as Accion })}
                        >
                          {existente(p.nombre) ? (
                            <option value="actualizar">Actualizar existente</option>
                          ) : (
                            <option value="crear">Crear</option>
                          )}
                          <option value="omitir">Omitir</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inline top-gap">
              <button className="btn primary" disabled={ocupado || !cantidad} onClick={importar}>
                {ocupado ? "Importando…" : `Importar ${cantidad} rubro${cantidad === 1 ? "" : "s"}`}
              </button>
              <button className="btn" disabled={ocupado} onClick={() => setPendientes([])}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Rubros ({rubros.length})</h2>
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
