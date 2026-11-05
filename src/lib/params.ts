/**
 * PARÁMETROS Y CRITERIOS DE AUDITORÍA DE KILOMETRAJE Y COMBUSTIBLE
 * Fuente única de verdad: el código los importa de acá y la pantalla "Auditoría km" los muestra con su justificación.
 * Origen: análisis de septiembre 2026 (un solo mes de combustible, 12 vehículos con GPS). Son provisorios: revisar con
 * 3+ meses de datos (ver PLAN_REANALISIS_DATOS.md).
 */

/** Margen sobre el rango de GPS entre dos lecturas: el mayor entre 50 km y 3 % del máximo. */
export const RANGE_TOL_ABS_KM = 50;
export const RANGE_TOL_PCT = 0.03;
/** El GPS se considera "caído" si aun su máximo posible es menos de este porcentaje de lo que marcó el odómetro. */
export const GPS_DEAD_RATIO = 0.2;
/** Ningún vehículo de la flota gasta menos que esto: base de la regla física (km máximos = (litros + tanque) / este valor). */
export const PHYSICAL_MIN_L_PER_100 = 3.5;
/** Capacidad de tanque supuesta si no se conoce (se usa la mayor carga vista si es mayor). */
export const DEFAULT_TANK_L = 40;
/** Margen de desvío de consumo aceptable por tipo de vehículo. */
export const CONSUMPTION_BAND: Record<string, number> = { Utilitario: 0.15, Auto: 0.15, Camioneta: 0.2, Furgón: 0.2, Camión: 0.3 };
export const CONSUMPTION_BAND_DEFAULT = 0.25;
/** Confiabilidad de conductor (km válidos) con intervalo de confianza de Wilson 95 %. */
export const TRUST = { altaMinLoads: 8, altaMinPct: 90, altaMinLower: 65, bajaMinLoads: 5, bajaMaxUpper: 80, sinHistorialLoads: 4 };
/** Días sin lectura real de tablero para pedir una nueva. */
export const STALE_READING_DAYS = 35;
/** Hallazgos del Informe. */
export const LOW_USE_KM = 300;
export const REJECTED_MIN_PER_DRIVER = 2;
export const NOT_ASSIGNED_MIN_PER_DRIVER = 3;
/** Consumo "implícito" de un tramo suelto fuera de este rango se marca como indicativo (no es concluyente por el nivel del tanque). */
export const PAIR_L100_MIN = 4;
export const PAIR_L100_MAX = 30;
export const PAIR_MIN_KM = 150;
/** Plausibilidad de lecturas sin GPS: km por día, margen fijo y retroceso tolerado (redondeo del tablero). */
export const OKODO_KM_PER_DAY = 700;
export const OKODO_BASE_KM = 1000;
export const OKODO_BACK_KM = 300;

export type ParamDoc = { name: string; value: string; why: string; review: string };

export const PARAM_DOCS: ParamDoc[] = [
  {
    name: 'Rango de GPS entre dos cargas',
    value: 'mínimo = días completos entre ambas fechas · máximo = más los dos días de las cargas',
    why: 'Las cargas no traen hora y el GPS suma días completos: una carga a la 1 AM deja casi todo el día después; una a las 23 h, casi todo antes. Un odómetro coherente cae dentro del rango.',
    review: 'No requiere calibración: es consecuencia de los datos disponibles.',
  },
  {
    name: 'Margen sobre el rango',
    value: `el mayor entre ${RANGE_TOL_ABS_KM} km y ${RANGE_TOL_PCT * 100} % del máximo`,
    why: 'El GPS mide casi igual que el odómetro (escala global 0,988 en septiembre) y el tablero redondea. Probado de 0 a 150 km: el resultado no cambia (1 tramo fuera de 26), así que el margen no decide.',
    review: 'Cuando haya ≥6 tramos por vehículo, usar un factor de escala propio de cada uno (hoy varía 0,935–1,086).',
  },
  {
    name: 'GPS caído',
    value: `máximo del rango < ${GPS_DEAD_RATIO * 100} % del odómetro`,
    why: 'El Sandero (AF751HM) tuvo el GPS sin registrar en septiembre: se mide por odómetro y se avisa revisar el equipo.',
    review: 'Si aparecen otros casos, revisar si el umbral debe subir.',
  },
  {
    name: 'Regla física de plausibilidad',
    value: `km máximos = (litros + capacidad del tanque) ÷ ${PHYSICAL_MIN_L_PER_100} L/100 km`,
    why: 'Con el combustible disponible no se puede recorrer más. Sobre 77 tramos rechazó 1 (AA726SG: 2.400 km con 20,7 L) y ningún falso positivo.',
    review: 'Cargar la capacidad real del tanque de cada vehículo.',
  },
  {
    name: 'Capacidad de tanque supuesta',
    value: `mayor carga vista del vehículo (mínimo ${DEFAULT_TANK_L} L)`,
    why: 'No hay dato de capacidad. Los Renault rinden 400–500 km por tanque (≈ 9–11 L/100 km, tanque ≈ 45–50 L).',
    review: 'Reemplazar por la capacidad real en la ficha.',
  },
  {
    name: 'Banda de desvío de consumo',
    value: 'utilitario/auto 15 % · camioneta/furgón 20 % · camión 30 % · otros 25 %',
    why: 'Septiembre: utilitarios 9,2–10,3 L/100 (muy parejos), camionetas 10,5–13,6, camión 24,4 y 16,6. Siempre se combina con el margen por nivel de tanque (capacidad ÷ km de la ventana).',
    review: 'Hoy hay 1–5 vehículos por tipo: recalcular con mediana y MAD por vehículo con ≥3 meses.',
  },
  {
    name: 'Consumo (método)',
    value: 'tanque a tanque acumulado',
    why: 'No se sabe con cuánto combustible salió el vehículo. Se suman los litros de todas las cargas de la ventana (incluidas las de km inválido) menos la primera, y se dividen por los km entre lecturas válidas. R² de 0,98–1,00 en todos los vehículos con datos.',
    review: 'Estable. Un tramo suelto entre dos cargas es solo indicativo.',
  },
  {
    name: 'Confiabilidad del conductor',
    value: `alta: ≥${TRUST.altaMinLoads} cargas, ≥${TRUST.altaMinPct} % válidas y piso del IC ≥${TRUST.altaMinLower} % · baja: ≥${TRUST.bajaMinLoads} cargas y techo del IC ≤${TRUST.bajaMaxUpper} % · menos de ${TRUST.sinHistorialLoads} cargas: sin historial`,
    why: 'Con pocas cargas los porcentajes engañan; se usa el intervalo de confianza de Wilson 95 %. En septiembre solo Cazal (0 de 6) y Acevedo (2 de 5) quedaron claramente por debajo; Cáceres Jorge, Congo Lisandro y Mourglia Javier con historial confiable. Un km inválido puede ser error del playero, no del conductor.',
    review: 'Recalcular cuando cada conductor tenga ≥10 cargas.',
  },
  {
    name: 'Lecturas confiables del tablero (ancla del km)',
    value: 'carga de estación válida · km cargado a mano · Mantenimientos · Reparaciones',
    why: 'Los km de Mantenimientos y Reparaciones se anotan en el taller leyendo el tablero (a veces redondeados). El km actual = última lectura + todo el GPS posterior. El km "calculado con GPS" nunca es una lectura.',
    review: 'Si un km de taller resulta inconsistente con las demás fuentes, corregirlo en su registro.',
  },
  {
    name: 'Fecha de la lectura al actualizar el km',
    value: 'se indica en el formulario (por defecto, hoy)',
    why: 'Si el tablero se leyó el 31/10 y se carga el 4/11, la lectura vale al 31/10: el GPS posterior se suma recién desde esa fecha y no se cuenta dos veces.',
    review: '—',
  },
  {
    name: 'Lectura de tablero atrasada',
    value: `más de ${STALE_READING_DAYS} días sin lectura real`,
    why: 'Anotar el km real cada cierto tiempo (por ejemplo una vez al mes con foto) es lo que corrige la deriva del GPS y detecta errores de carga.',
    review: 'Ajustar según la frecuencia con que se tomen lecturas.',
  },
  {
    name: 'Plausibilidad sin GPS',
    value: `hasta ${OKODO_KM_PER_DAY} km/día + ${OKODO_BASE_KM} km; retroceso tolerado ${OKODO_BACK_KM} km`,
    why: 'Para los 9 vehículos sin GPS solo se puede acotar lo físicamente posible. Es un control grueso.',
    review: 'Agregar los vehículos a Gestya para auditarlos de verdad.',
  },
  {
    name: 'Hallazgos del Informe',
    value: `baja utilización < ${LOW_USE_KM} km/mes · ${REJECTED_MIN_PER_DRIVER}+ cargas con km inválido por conductor · ${NOT_ASSIGNED_MIN_PER_DRIVER}+ cargas en vehículo ajeno`,
    why: 'Umbrales de atención operativa, no estadísticos.',
    review: 'Ajustar con el uso.',
  },
];
