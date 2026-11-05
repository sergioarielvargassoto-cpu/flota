# Auditoría integral del sistema · 4/11/2026

Alcance: seguridad, base de datos, integridad de datos, lógica de km/combustible, código, rendimiento, UX/accesibilidad y operación.
Método: revisión directa del código y de la base real (solo lectura), pruebas con los datos de septiembre/octubre, y tres revisiones
independientes en paralelo (lógica de km, UX, arquitectura/seguridad). Todo hallazgo de esas revisiones fue **verificado en el código
o en la base** antes de actuar.

Herramientas de consulta evaluadas (no se instaló nada, solo se usaron como lista de control): guías de Supabase (Postgres + seguridad),
guías de React de Vercel y guías de interfaz de Vercel (copia fija revisada, porque la original se descarga de internet en cada uso).

## 1. Pendiente que requiere TU acción (no se puede hacer desde el código)

| # | Qué | Por qué | Cómo |
|---|-----|---------|------|
| 1 | **Apagar el registro de usuarios** | Cualquiera con la URL y la clave pública puede crear una cuenta y, con las políticas actuales, ver y editar TODOS los datos (choferes con DNI, combustible, etc.). | Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" = OFF |
| 2 | **Aplicar `supabase/migrations/0008_usuarios_autorizados.sql`** | Deja una sola política por tabla que exige estar en la lista de emails autorizados (hoy hay dos políticas abiertas por tabla: `solo_logueados` y `*_auth_all`). | Supabase → SQL Editor → pegar y ejecutar. Es "todo o nada". Autoriza `sergioarielvargassoto@gmail.com`; para sumar gente: `insert into allowed_users(email) values ('...')`. |
| 2b | **Aplicar `supabase/migrations/0009_proteger_historial_vehiculos.sql`** | Impide borrar vehículos con historial aunque se intente desde el panel de Supabase. | SQL Editor → pegar y ejecutar |
| 3 | **Mover o cifrar `backups/`** | Está dentro de OneDrive (se sincroniza a la nube) y contiene DNI, multas, etc. Está fuera de git, pero no cifrado. | El script guarda en `backups/` relativo a donde se ejecuta: moverlo periódicamente a una carpeta fuera de OneDrive (o cifrarlo), o ejecutarlo desde una carpeta no sincronizada. |
| 4 | Cargar **km del último service** de 14 de 21 vehículos | Sin ese dato no existe control de service para esos vehículos. | Vehículos → Editar |
| 5 | Cargar **fecha de vencimiento** en 68 de 147 documentos | Sin fecha no hay alerta. Hoy hay 1 vencido (SENASA AG538DX, 12/06/2025). | Vencimientos |
| 6 | Asignar chofer a 8 vehículos | Sin chofer asignado no se detectan cargas en vehículos ajenos. | Vehículos → Editar |

## 2. Corregido en esta auditoría

**Lógica de km y combustible**
- Un cambio mío del mismo día (insertar el reporte mensual antes de borrar el viejo) habría **roto toda reimportación** por la restricción
  única `(vehicle_id, month, year)`. Detectado antes de publicarlo. Ahora: se borra, se inserta y, si falla, **se restauran** los datos anteriores.
- Las consultas del importador tenían un **tope silencioso de 1.000 filas** (Supabase). Ahora se paginan.
- El consumo L/100 km **ignoraba los litros de cargas con odómetro descartado**, subestimando el consumo (por ejemplo AH530QG daba 4,2 y es 7,6;
  flota 10,4 → 11,9). Corregido en vehículo y en chofer.
- La validación de lecturas rechazaba por error cargas atrasadas o del mismo día de la última lectura (culpando al chofer). Ahora se valida contra la
  última lectura confiable y el GPS del tramo. La "última lectura" considera también el km cargado a mano.
- Cargar un registro (reparación, service) con fecha anterior **hacía retroceder `km_date`** y el GPS se volvía a sumar (duplicaba km). Ahora solo avanza con
  fechas no anteriores y un salto irracional pide confirmación.
- El botón "Actualizar km" no permitía corregir un km inflado y mostraba la fecha un día antes. Ahora permite bajarlo con confirmación y muestra la fecha correcta.
- Auditoría posterior a Gestya: ya no culpa a vehículos **sin GPS** (llenaba el tope de avisos) y admite el margen de un día de recorrido.
- Fechas de Excel con hora ya no se corren al día siguiente; "0.125" ya no se lee como 125.
- Informe: el mes en curso se marca como **parcial** y no se compara con el mes anterior; el AdBlue ahora entra en el gasto.
- Se quitó una función de importación vieja que borraba sin verificar.

**Seguridad y dependencias**
- `xlsx` (vulnerabilidad alta conocida al leer archivos) actualizado a 0.20.3 desde el sitio oficial de SheetJS: **0 vulnerabilidades**; lee idéntico tus archivos.
- Migración `0002` tenía sintaxis inválida (`CREATE POLICY IF NOT EXISTS`); corregida.

**Rendimiento / robustez**
- El cargador de datos descartaba en silencio recargas simultáneas y cambiaba de identidad en cada carga, redibujando toda la app. Corregido.

**Interfaz**
- Impresión del Informe (A4 apaisado, sin menús/botones, tablas sin cortes), con fecha de emisión.
- Foco visible con teclado, menú con scroll horizontal en celular, ventanas con Escape y rol de diálogo, error de importación visible,
  mensaje de carga sin la pista técnica de SQL, estado vacío con enlaces, soporte de "reducir movimiento".

## 2b. Política de bajas de vehículos (implementada)
- **Un vehículo con historial nunca se elimina:** se da de baja (estado "Baja", con fecha y motivo) y conserva documentos, mantenimientos, reparaciones, combustible,
  recorridos, historial de km, infracciones y **archivos adjuntos**. Antes, "Eliminar" borraba en cascada y además borraba los adjuntos del almacenamiento.
- El botón "Eliminar" solo queda disponible si el vehículo no tiene ningún registro (creado por error).
- **📄 Exportar legajo (Excel):** datos, historial de km, documentos, mantenimientos, reparaciones, combustible, recorridos GPS, reportes, infracciones y lista de archivos adjuntos.
- Listado de Vehículos oculta las bajas; "Ver archivo de bajas" las muestra. Los vehículos dados de baja siguen contando en las estadísticas de los meses en que tuvieron actividad.
- `supabase/migrations/0009_proteger_historial_vehiculos.sql` (NO aplicada): disparador que impide borrar, a nivel base de datos, cualquier vehículo con registros asociados.

## 3. Verificado y en buen estado
- Sin datos visibles para visitantes sin sesión (las 16 tablas devuelven 0 filas con la clave pública).
- Bucket de adjuntos privado, con límite de 10 MB, URLs firmadas de 120 s.
- Ninguna clave secreta en el repositorio ni en su historial; `service_role` no se usa en el código de la app; `.env.local` y `backups/` fuera de git.
- Sin `dangerouslySetInnerHTML`/`innerHTML`; nombres de adjuntos saneados.
- Integridad de datos: sin registros huérfanos, sin duplicados (patentes, choferes, recorridos, remitos), historial de km coherente con el km actual, sin fechas futuras.
- Los precios por litro "raros" son bidones de AdBlue (se cobran por unidad).
- Odómetro vs GPS sobre ventanas completas: diferencia media +1,6 % (el GPS es confiable; las diferencias en tramos cortos son por días enteros y km mal digitados).

## 4. Recomendado a mediano plazo (no urgente)
- **Esquema reproducible:** las tablas `infractions`, `fines` (y la columna `attachments.infraction_id`) existen en la base pero **no en ninguna migración**; un entorno nuevo
  (restauración) fallaría. Generar el esquema real (`supabase db dump --schema public`) y versionarlo.
- Índices: faltan en FKs (`vehicles.driver_id`, `*.workshop_id`, `attachments.*_id`) y sobran algunos duplicados (0006). Agregar `CHECK` en columnas numéricas (litros > 0, costos ≥ 0).
- Cabeceras de seguridad HTTP (CSP, X-Frame-Options, etc.) en `next.config`; tipos MIME permitidos también en el bucket (incluido en 0008).
- Escala: hoy se cargan las 15 tablas completas al abrir y cada edición recarga la tabla entera. Aguanta años a este volumen; cuando `trips` pase de unos 10.000 registros,
  limitar a los últimos 12–24 meses y cargar los historiales bajo demanda.
- Reemplazar `alert/confirm/prompt` por ventanas propias (hoy hay ~30), filas clicables con teclado, formatos de número con coma decimal en Recorridos/Combustible.
- Activar protección contra fuerza bruta en el login (CAPTCHA / límites de Supabase Auth) y exigir contraseñas fuertes.
