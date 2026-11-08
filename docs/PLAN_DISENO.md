# Plan de diseño — calidad "Análisis" en toda la app

Stack real: Next 16 (app router, páginas cliente + Supabase), **CSS global propio sin Tailwind** (`src/app/globals.css`),
**Recharts 3** ya instalado (se conserva: la consigna dice no reemplazar una librería existente; se le aplican tokens, reglas e interacciones).
Sin tests de UI: se agregan con `node --test` (Node 26 ejecuta TypeScript nativo, sin dependencias nuevas).

Línea base (antes de cambiar nada): `tsc` ✅ · `next build` ✅ · `eslint` ❌ ya roto (falta `eslint-config-next`; arreglarlo exige agregar una dependencia → se informa, no se toca).

## Inventario

| Pantalla | Archivo | Formularios | Tablas | Gráficos |
|---|---|---|---|---|
| Panel | `src/app/page.tsx` | filtro + checkbox | 2 | — (7+4 KPIs) |
| Vehículos / detalle | `src/app/vehiculos/page.tsx`, `[id]` | búsqueda, modales | 1 + compartidas | — |
| Choferes / detalle | `src/app/choferes/…` | búsqueda, modales | 1 + compartidas | — |
| Infracciones / detalle | `src/app/infracciones/…` | filtros, modales | 2 | — |
| Informe de gestión | `src/app/informe/page.tsx` | filtros | 6 | 6 (línea, barras) |
| Reparaciones / Mantenimientos | `src/app/reparaciones/…`, `mantenimientos/…` | modales | compartidas | — |
| Recorridos | `src/app/recorridos/page.tsx` | filtros, importación | 2 | — |
| Auditoría km | `src/app/auditoria-km/page.tsx` | filtros | 7 | — |
| Combustible | `src/app/combustible/page.tsx` | filtros, importación | 2 | — |
| Talleres / Ajustes | `src/app/talleres`, `ajustes` | formularios de ajustes | 1 | — |
| Reportes km / costos / conductores / sucursales | `src/app/reportes-*/page.tsx` | filtros de período | 1–2 c/u | 2–4 c/u (barras, línea, torta, dispersión) |
| Componentes | `Shell`, `FormModal`, `forms`, `Tables`, `Badge`, `ImportDialog`, `Attachments`, `HistoryTimeline`, `AuthGate` | | | |

## Etapas

Extra pedido por el dueño (07/11): vehículos ordenados de la patente más nueva a la más vieja en todas las listas y selectores (`src/lib/patentes.ts`, aplicado al cargar en `src/lib/data.tsx`).

- [x] 0. Orden por patente (Mercosur AA123BB > ABC123 > A1234567 > otras por año) con tests

- [x] 1. Tokens `--an-*` en `:root` + base del documento (stack del sistema, foco visible); alias de las variables viejas → tokens nuevos
- [x] 2. Sin fuentes externas: quitar Google Fonts (Inter) de `layout.tsx`
- [x] 3. Primitivas: tarjeta, botones (`b1` primario, `b2` secundario con borde ≥3:1, `b3` peligro), píldora, campo (borde `#8d86a8`), etiqueta, checkbox
- [x] 4. Layout: enlace "saltar al contenido", `<title>` por página, navegación con foco/estado visible, estados de carga (esqueleto) y error (con reintento)
- [x] 5. Formularios: `FormModal` con `aria-invalid` / `aria-describedby`, foco al primer error, anti doble envío con `ref`; `label htmlFor` en todos los campos
- [x] 6. Indicadores: KPIs del Panel con valor negro grande `tabular-nums`, señal por ícono + texto (no sólo color)
- [x] 7. Gráficos: módulo `chartTheme` (paleta violeta+negro, trazos rayado/punteado), `TarjetaGrafico` con "Ver tabla" / "Ver gráfico", leyenda con claves de trazo, títulos-hallazgo; aplicado a Informe + 4 reportes
- [x] 8. Tablas: `th scope`, `caption`, cifras `tabular-nums`
- [x] 9. Tests: `graficos.ts` (formatos, contraste WCAG de la paleta) con `node --test`
- [x] 10a. Revisión final: tsc ✅ · build ✅ · 12 tests ✅ · contraste medido ✅ · login verificado en navegador
- [ ] 10b. Recorrida visual de las pantallas internas (requiere que el dueño inicie sesión)

## Contrastes medidos (WCAG 2.x, `scripts/graficos.test.ts` + medición puntual)

| Par | Antes | Ahora |
|---|---|---|
| Borde de campos sobre blanco | `#e5ddf8` 1,31:1 ❌ | `#8d86a8` 3,44:1 ✅ |
| Botón peligro (b3) texto rojo | `#ef4444` 3,76:1 ❌ | `#b91c1c` 6,47:1 ✅ |
| KPI "Urgentes" (número amarillo) | `#eab308` 1,92:1 ❌ | número negro 20,1:1 + ícono y texto ✅ |
| KPI "Próximos" (número lima) | `#c5e063` 1,48:1 ❌ | número negro + ícono y texto ✅ |
| Insignia "Próximo" | 4,57:1 (justo) | `#166534` sobre `#dcfce7` 6,49:1 ✅ |
| Texto secundario `--an-ink-2` / auxiliar `--an-muted` | — | 10,39:1 / 6,30:1 ✅ |
| Blanco sobre botón primario `#6d28d9` | `#7c3aed` 5,70:1 | 7,10:1 ✅ |
| Barras `#9975fa` / énfasis `#5722ad` / línea `#3a1576` | arco iris | 3,34 / 9,39 / 13,56:1 ✅ |
| Insignias vencido / crítico / urgente / ok | 5,74 / 5,24 / 7,45 / 6,78 | sin cambio (ya pasaban) |

## Decidido NO cambiar
- **Recharts se conserva** (la consigna dice no reemplazar una librería existente); se le aplicaron tokens, tooltip, leyenda y tabla equivalente. Su `accessibilityLayer` da la navegación por flechas.
- **Colores semánticos de vencimientos** (rojo/naranja/ámbar/verde) en insignias: es información de estado, siempre van con texto y pasan 4,5:1.
- **ESLint**: ya estaba roto (falta `eslint-config-next`); arreglarlo exige agregar una dependencia.
- **Rankings por métrica** (km, importe) no se reordenan por patente.

## Fallos de lógica preexistentes detectados (no corregidos: no son de presentación)
- Reportes km y costos: "Todas las sucursales" vuelve a la primera sucursal (`branch = branches[0]`).
- Reporte de costos: la evolución usa `branch` y la tabla `selectedBranch`.
- Reporte de conductores: `calcularAnalisisConductores` recibe la sucursal pero no la usa.
- Reporte km: si todos los vehículos del mes están excluidos no aparece el tilde "Mostrar excluidos".
- Borrar reparación/mantenimiento desde su ficha no borra los adjuntos (desde la tabla sí).
- **Corregido** (rompía la pantalla): `infracciones/[id]` leía `params.id` en forma sincrónica, que Next 16 ya no permite → pasó a `useParams()` como las otras fichas.
