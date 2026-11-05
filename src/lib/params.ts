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
/** Días SIN datos de GPS entre el último día cargado y una referencia más nueva: se admite hasta este recorrido por día. */
export const UNCOVERED_GPS_KM_PER_DAY = 400;
/** Cuántas lecturas vecinas (de cualquier fuente) se contrastan de cada lado de una lectura: más historia = más precisión. */
export const NEIGHBORS_EACH_SIDE = 3;
/** Un GPS es "confiable" para auditar si, en los tramos limpios del vehículo, odómetro ÷ GPS está en este rango. */
export const GPS_RELIABLE_MIN = 0.75;
export const GPS_RELIABLE_MAX = 1.3;
/** Ningún vehículo de la flota gasta menos que esto: base de la regla física (km máximos = (litros + tanque) / este valor). */
export const PHYSICAL_MIN_L_PER_100 = 3.5;
/** La regla física solo se aplica si la referencia es de hace hasta este número de días (con una referencia vieja pudo haber cargas que no están en los datos). */
export const PHYSICAL_RULE_MAX_GAP_DAYS = 7;
/** Máximo para un vehículo cuyo modelo no está en TANK_CAPACITY: una carga mayor es error de tipeo y NO se usa para estimar el tanque. */
export const MAX_PLAUSIBLE_LOAD_L = 300;

/**
 * Capacidad máxima del tanque por modelo (litros): ninguna carga puede superarla. Se toma la cifra MÁS ALTA razonable de fábrica
 * (incluidos tanques opcionales), para no descartar cargas verdaderas. `ok` = confirmado en ficha oficial; si no, es estimación a verificar.
 * Las cargas observadas en los datos de septiembre/octubre (máx. por vehículo) están todas por debajo de estos valores.
 */
export const TANK_CAPACITY: { re: RegExp; liters: number; ok: boolean; label: string }[] = [
  { re: /kangoo/i, liters: 50, ok: true, label: 'Renault Kangoo (folleto Renault Argentina: 50 L)' },
  { re: /sandero/i, liters: 50, ok: false, label: 'Renault Sandero (≈ 50 L, a verificar)' },
  { re: /par[tn]{1,2}er/i, liters: 60, ok: false, label: 'Peugeot Partner (55–60 L según fuente)' },
  { re: /berlingo/i, liters: 60, ok: false, label: 'Citroën Berlingo (≈ 60 L, a verificar)' },
  { re: /transit/i, liters: 80, ok: false, label: 'Ford Transit 2.2 (≈ 80 L, una sola fuente)' },
  { re: /sprinter/i, liters: 100, ok: false, label: 'Mercedes-Benz Sprinter (71 L / 93 L de fábrica; 100 L como tope)' },
  { re: /atego/i, liters: 300, ok: true, label: 'Mercedes-Benz Atego (300 L, confirmado por el responsable)' },
  { re: /cargo/i, liters: 150, ok: true, label: 'Ford Cargo 1119 (150 L, confirmado por el responsable)' },
  { re: /(^|\s)4\.?000|f-?4000/i, liters: 140, ok: true, label: 'Ford F-4000 (140 L, confirmado por el responsable)' },
];
/** Capacidad máxima de tanque (L) del vehículo según marca/modelo; si no se conoce, MAX_PLAUSIBLE_LOAD_L. */
export function tankMaxL(v: { brand?: string | null; model?: string | null } | null | undefined): number {
  const txt = `${v?.brand ?? ''} ${v?.model ?? ''}`;
  return TANK_CAPACITY.find((t) => t.re.test(txt))?.liters ?? MAX_PLAUSIBLE_LOAD_L;
}
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
/** Los km de taller suelen venir redondeados (a 500 o 1.000): diferencia tolerada contra las lecturas vecinas al cargar un registro. */
export const TALLER_ROUND_KM = 500;

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
    name: 'Confiabilidad del GPS de cada vehículo',
    value: `odómetro ÷ GPS entre ${GPS_RELIABLE_MIN} y ${GPS_RELIABLE_MAX} en sus propios tramos limpios (mín. 2 tramos)`,
    why: 'En septiembre la flota dio entre 0,93 y 1,09. El Sandero (GPS intermitente) dio un cociente enorme: con un GPS así no se puede descartar una lectura de estación, porque el que falla es el GPS. Con menos de 2 tramos no hay evidencia en contra y se asume confiable.',
    review: 'Recalcular cada mes; revisar el equipo del Sandero.',
  },
  {
    name: 'Referencia aproximada (carga manual o de taller)',
    value: `margen extra de ${TALLER_ROUND_KM} km al validar lecturas contra ella`,
    why: 'Los km de taller y los cargados a mano pueden venir redondeados. Prueba con septiembre: si la referencia estuviera desviada 250 km, sin este margen se rechazan lecturas buenas; con él, no.',
    review: 'Con una referencia exacta (lectura de estación válida) no se aplica.',
  },
  {
    name: 'Km en 0 cargado a mano = "pendiente de verificar"',
    value: 'deja sin efecto lo conocido hasta ese momento; no se pisa con combustible ni con GPS acumulado',
    why: 'Cuando el responsable no está seguro del km (p. ej. AI605GB), un 0 evita que el sistema invente un valor. Rige en TODOS los caminos que escriben el km: la importación de Gestya (GPS) no lo pisa, la de combustible no recalcula ese vehículo, y el recálculo por registros ignora todo lo anterior al marcador. Se reemplaza al cargar el km real con su fecha de lectura.',
    review: '—',
  },
  {
    name: 'Lectura del mismo día que la referencia',
    value: `acepta un retroceso de hasta ${OKODO_BACK_KM} km (+ margen de la referencia aproximada) y un avance de hasta el recorrido GPS de ese día (o ${OKODO_KM_PER_DAY} km sin GPS)`,
    why: 'Las cargas no traen hora: dos lecturas del mismo día pueden estar en cualquier orden, y una puede ser anterior a la de referencia. Comparar con el rango "entre fechas" (que daría 0 km) rechazaba lecturas buenas; no se puede saber el sentido, así que solo se descarta lo imposible en ambos sentidos.',
    review: 'Si las cargas llegaran con hora, ordenar por hora y aplicar el rango normal.',
  },
  {
    name: 'Lectura anterior a la referencia / GPS sin cargar al día',
    value: `referencia − GPS del tramo · si la referencia es posterior al último día de GPS cargado se admite hasta ${UNCOVERED_GPS_KM_PER_DAY} km por cada día sin datos`,
    why: 'Los remitos tardíos y los archivos de un mes ya cubierto son comunes. Y un service anotado el 03/11 con GPS hasta el 31/10 no debe hacer descartar lecturas de octubre: se usa el GPS que hay y se tolera el recorrido de los días que faltan.',
    review: 'Se reduce sola a medida que se importa el GPS al día.',
  },
  {
    name: 'Orden de prioridad entre lecturas',
    value: 'misma fecha: manual > taller > estación; entre iguales, la última registrada',
    why: 'Una lectura cargada a mano por el responsable corrige a la de una estación; entre dos del mismo tipo y día vale la más reciente de cargar. Solo cuentan como lectura: estación válida, km a mano con fecha de lectura, mantenimiento y reparación. Los asientos "gps", "combustible" y "registro" del historial son consecuencia del cálculo, no lecturas.',
    review: '—',
  },
  {
    name: 'Km del último service (derivado)',
    value: 'km del mantenimiento tipo "service" más reciente (por fecha y, si empatan, el mayor)',
    why: 'Se recalcula al crear, editar o borrar un registro: si se corrige o elimina un service, el próximo vencimiento se corrige solo (antes solo podía subir). Si no queda ningún service, se conserva el valor de la ficha, porque pudo cargarse a mano.',
    review: 'Cargar el km del último service de los vehículos que no tienen mantenimientos registrados.',
  },
  {
    name: 'Km guardado derivado vs. tipeado',
    value: 'derivado = el último cambio del historial lo hizo el sistema (gps, combustible o registro) y coincide con el km guardado',
    why: 'Sin GPS que cubra desde la última lectura, el km solo se recalcula si la lectura es tan reciente como el dato guardado, o si el guardado era derivado (por ejemplo venía de un registro que se corrigió o borró). Un km tipeado a mano sin respaldo se respeta.',
    review: '—',
  },
  {
    name: 'Contraste con la trayectoria (varias lecturas, no solo la última)',
    value: `cada lectura se compara con hasta ${NEIGHBORS_EACH_SIDE} anteriores y ${NEIGHBORS_EACH_SIDE} posteriores; atípica = no concuerda con ninguna; dudosa = concuerda con menos de la mitad (con 3 o más vecinas)`,
    why: 'Concordar es que el avance del odómetro entre ambas fechas quepa en el rango de GPS (o sea posible si no hay GPS confiable), contando el redondeo de taller. Así un 123, un 213.000 o un 134.999 no tienen respaldo en ninguna vecina, aunque la última lectura sea buena o esté mal. Con septiembre-octubre, errores de ±500 km pasan (redondeo) y desde ±800 km se marcan. Si hay UNA sola vecina no se sabe cuál de las dos está mal: se marca "dudosa" y el importador no la descarta. El margen de cada par es la SUMA de los márgenes de ambas lecturas (dos anotaciones de taller pueden estar redondeadas en sentidos opuestos).',
    review: 'Con más lecturas por vehículo se puede subir a más vecinas y afinar el margen. Es la mejora que más se beneficia de tener más datos.',
  },
  {
    name: 'Vehículos fáciles de confundir',
    value: 'patentes que difieren en ≤ 2 caracteres, o del mismo estilo antiguo (3 letras + 3 números) que empiezan igual y con km dentro del 10 %; más los pares que indique el responsable (OQK804 ↔ OUG184)',
    why: 'Si un dato se carga en el vehículo equivocado, los km y consumos de los dos quedan mal. En septiembre una carga del OUG184 (309.194 km) también encaja con la trayectoria del OQK804, y no se puede saber de cuál es. Se avisa en la ficha, en el formulario de km, al guardar registros, al importar combustible y en Auditoría.',
    review: 'Cuando haya más lecturas por vehículo, la coincidencia con el gemelo se podrá descartar con más seguridad.',
  },
  {
    name: 'GPS caído (solo diagnóstico)',
    value: `máximo del rango < ${GPS_DEAD_RATIO * 100} % del odómetro`,
    why: 'El Sandero (AF751HM) tuvo el GPS sin registrar en septiembre: se avisa revisar el equipo. Es solo una alerta: NO sirve para aprobar lecturas. Un GPS que casi no registró no prueba que el odómetro esté bien, y para un vehículo con GPS confiable una lectura que no cabe en el rango se descarta igual (un 120.000 contra 123.235 no debe pasar por "GPS caído").',
    review: 'Si aparecen otros casos, revisar si el umbral debe subir.',
  },
  {
    name: 'Regla física de plausibilidad',
    value: `km máximos = (litros + capacidad del tanque) ÷ ${PHYSICAL_MIN_L_PER_100} L/100 km · solo si la referencia es de hace ${PHYSICAL_RULE_MAX_GAP_DAYS} días o menos`,
    why: `Con el combustible disponible no se puede recorrer más. Sobre 77 tramos rechazó 1 (AA726SG: 2.400 km con 20,7 L) y ningún falso positivo. Con una referencia más vieja que ${PHYSICAL_RULE_MAX_GAP_DAYS} días pudo haber cargas que no están en los datos: ahí la regla no se aplica y decide el GPS (si no, se rechazarían lecturas buenas tras un hueco de datos). Una carga mayor a la capacidad del tanque del modelo (ver "Capacidad de tanque") es error de tipeo y no cuenta para estimar el tanque.`,
    review: 'Cargar la capacidad real del tanque de cada vehículo; revisar el límite de días con más meses.',
  },
  {
    name: 'Capacidad de tanque (máximo por carga)',
    value: `mayor carga vista del vehículo (mínimo ${DEFAULT_TANK_L} L), sin superar el máximo de su modelo: ${TANK_CAPACITY.map((t) => `${t.label.split(' (')[0]} ${t.liters} L${t.ok ? '' : '*'}`).join(' · ')}; modelo no listado: ${MAX_PLAUSIBLE_LOAD_L} L`,
    why: 'Una carga mayor a la capacidad del tanque es físicamente imposible (error de tipeo) y no debe usarse para estimar el tanque. El tope es el mayor valor razonable de fábrica de cada modelo, para no descartar cargas verdaderas. *Confirmados (sin *): Kangoo con ficha oficial y Cargo, F-4000 y Atego por el responsable; el resto es estimación a verificar con la ficha o el manual del vehículo.',
    review: 'Verificar los marcados con *; idealmente guardar la capacidad en la ficha de cada vehículo.',
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
    name: 'Km cargado en Mantenimientos / Reparaciones (control al guardar)',
    value: `se pide confirmar si el km retrocede más de ${TALLER_ROUND_KM} km o sube más de ${OKODO_KM_PER_DAY} km/día + ${OKODO_BASE_KM} km respecto de las lecturas vecinas`,
    why: 'El km del vehículo se DERIVA de sus lecturas (última lectura + GPS posterior) y se recalcula al crear, editar o borrar un registro: corregir un registro corrige también el km del vehículo. El control evita guardar tipeos (p. ej. 213.000 en lugar de 143.000).',
    review: 'Si el redondeo de taller es mayor, subir la tolerancia.',
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
