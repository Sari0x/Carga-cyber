# Carga Cyber

Genera los Excel de megaofertas (Cyber Monday / Hot Sale) a partir del export **Productos E3** de Novogar.

## Cómo se usa

0. **Base de productos:** importá el export de Productos E3 (completo o parcial). Se guarda en Supabase por SKU con
   precios, imágenes, filtros y ficha técnica; volvé a importarlo para actualizar.
1. **Rubros y mapeos → Importar plantillas:** subí una o varias plantillas de megaofertas a la vez (las que traen la hoja
   "Ayuda 1"). La app guarda las columnas, la categoría y los atributos con sus valores permitidos. En el editor
   elegís las categorías de la tienda del rubro y "Sugerir todas las reglas" las prueba contra esos productos.
2. **Editar reglas:** cada atributo usa una regla:
   - *Mapeo de valores*: valor de un campo del E3 (`Filtro: …`, `Ficha: …`, `Marca`…) → opción del cyber.
   - *Palabra clave*: busca palabras en `Nombre`/`Url` (por ejemplo "termotanque" → Termotanque).
   - *Rango numérico*: toma el número del campo ("60 Lts" → 60) y lo ubica en el rango.
   - *Valor fijo* o *Dejar vacío*.
   Si nada coincide se usa el valor de "Si no coincide" (normalmente "Más").
3. **Generar archivo:** pegá la lista de SKUs, elegí el rubro, revisá la vista previa y
   descargá el Excel.

Columnas fijas (misma lógica que el Apps Script anterior):

| Columna | Valor |
|---|---|
| Link previo / Link | `https://www.novogar.com.ar/tienda/` + `Índices` (+ UTM en Link) |
| Precio en oferta | `Precio` del E3 o `contadoWeb` de Firebase, terminado en 9. Los SKU `-1` usan siempre el E3 |
| Precio anterior | `Precio de Lista` del E3 o % sobre la oferta, terminado en 9 |
| Precio sin impuestos | oferta / (1 + `Impuestos` / 100) |
| Imágenes | hasta 3, vía wsrv.nl a 500x375 jpg, empezando por la principal |
| Financiación, retiro, envíos, etc. | configurables en "Precios y valores fijos" |

## Desarrollo

```bash
npm install
npm run dev
```

Variables (`.env.local`, y en Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Supabase guarda la base de productos (`productos`), los rubros (`rubros`) y los ajustes (`ajustes`). La app no tiene login: cualquiera con el link puede
leer y editar esas tablas.
