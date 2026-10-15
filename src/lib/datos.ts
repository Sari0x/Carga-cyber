import { supabase } from "./supabase/client";
import { AJUSTES_DEFAULT, type Ajustes, type Rubro } from "./types";

export async function listarRubros(): Promise<Rubro[]> {
  const { data, error } = await supabase
    .from("rubros")
    .select("id, nombre, headers, defaults, atributos")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []) as Rubro[];
}

export async function crearRubro(r: Omit<Rubro, "id">): Promise<Rubro> {
  const { data, error } = await supabase
    .from("rubros")
    .insert(r)
    .select("id, nombre, headers, defaults, atributos")
    .single();
  if (error) throw new Error(error.message);
  return data as Rubro;
}

export async function guardarRubro(r: Rubro): Promise<void> {
  const { error } = await supabase
    .from("rubros")
    .update({ nombre: r.nombre, headers: r.headers, defaults: r.defaults, atributos: r.atributos })
    .eq("id", r.id);
  if (error) throw new Error(error.message);
}

export async function borrarRubro(id: string): Promise<void> {
  const { error } = await supabase.from("rubros").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function leerAjustes(): Promise<Ajustes> {
  const { data, error } = await supabase.from("ajustes").select("valor").eq("clave", "general").maybeSingle();
  if (error) throw new Error(error.message);
  return { ...AJUSTES_DEFAULT, ...((data?.valor as Partial<Ajustes>) ?? {}) };
}

export async function guardarAjustes(a: Ajustes): Promise<void> {
  const { error } = await supabase.from("ajustes").upsert({ clave: "general", valor: a });
  if (error) throw new Error(error.message);
}
