# Plan de re-análisis de datos (más riguroso) · pendiente

Creado el 4/11/2026. **Cuándo hacerlo:** cuando haya al menos 3 meses de combustible de YPF cargados (septiembre ya está; faltan octubre, noviembre y diciembre)
y 3 meses de GPS (Gestya) por vehículo. El análisis de septiembre (`ANALISIS_CALIBRACION_2026-11-04.md`) usó **un solo mes** de combustible y
vehículos con 1 a 14 lecturas: sirve para orientar, no para fijar parámetros definitivos.

## Principio (dicho por el dueño, 4/11/2026)
Hoy hay poca información; con más datos el control será mucho más preciso. La validación ya no compara solo con la última lectura confiable:
cada lectura se contrasta con hasta **3 anteriores y 3 posteriores** de cualquier fuente (estación, km a mano, mantenimiento, reparación) y con el GPS
(`src/lib/kmTrajectory.ts`). Con más lecturas por vehículo se puede subir `NEIGHBORS_EACH_SIDE`, afinar el margen y calcular un factor de escala propio por vehículo.

## Regla: no rescatar lecturas descartadas solo porque encajen con el GPS (4/11/2026)
El dueño advirtió que una lectura de estación descartada puede ser de OTRO vehículo (por ejemplo OUG184, 04/09, 309.194 km, García Ramón, remito 3561-00082476:
encaja con el GPS de OUG184 a 15 km, pero eso no prueba que la carga sea suya; con YPF en Ruta cada tarjeta está asociada a un vehículo, así que sería poco probable, a confirmar).
Por eso NO hay rescate automático de lecturas descartadas: solo se revalida si el responsable confirma con el comprobante y la tarjeta usada. El importador avisa cuando la tarjeta de una carga
no es la registrada para el vehículo (fuel_loads no guarda la tarjeta por carga; mejora posible con una columna nueva).

## Qué rehacer, con más datos
1. **Factor de escala odómetro/GPS por vehículo** (regresión por el origen, con intervalo de confianza). Exigir ≥6 tramos limpios por unidad.
   En septiembre: AG281ZJ 0,935 · AH530QG 1,086 · AE615LU 1,024 · AE547NW 0,992 · AF630PC 1,000 · AE149OR 0,953.
   Si el factor es estable, comparar contra `factor × GPS` en vez de contra 1,00 y achicar el margen.
2. **Bandas de consumo por tipo y por vehículo** (hoy provisorias: utilitario/auto 15 %, camioneta/furgón 20 %, camión 30 %). Usar mediana y MAD por vehículo
   con ≥3 meses, y la banda por tipo solo para vehículos nuevos. Revisar estacionalidad (verano/invierno, carga, rutas).
3. **Modelo de efectos para los km inválidos:** separar con más datos el efecto de **estación (playero)**, **vehículo** y **conductor**
   (regresión logística con efectos mixtos, o al menos tablas cruzadas con prueba exacta). En septiembre el efecto por vehículo y por estación fue
   significativo; con 115 cargas no se pueden separar los tres.
4. **Confiabilidad de conductor:** recalcular con intervalos de Wilson (ya implementado) cuando cada conductor tenga ≥10 cargas.
   Los niveles actuales son provisorios.
5. **Reglas físicas y umbrales:** verificar la regla `(litros + capacidad del tanque) / 3,5 L/100` contra todos los tramos nuevos (en septiembre rechazó 1 de 77),
   y la capacidad de tanque estimada (hoy = mayor carga vista; conviene cargar la capacidad real en la ficha del vehículo).
6. **Detección de anomalías de combustible:** ajuste de litros acumulados vs km por vehículo (R², intercepto, residuos); marcar cargas con residuo grande.
   Evaluar si hay pérdidas (carga sin recorrido equivalente) con datos de 3+ meses.
7. **Sensibilidad:** repetir el barrido de márgenes (0–150 km, 0–5 %) y elegir el más estable.
8. **Cobertura GPS:** 9 de 21 vehículos no tienen GPS; decidir si se agregan a Gestya. Para ellos solo hay odómetro de estaciones.

## Conocimiento del dueño (hay que tenerlo en cuenta al interpretar)
- **AG281ZJ (camión Mercedes, conductor Cáceres Nahuel) es muy confiable:** suele reportar bien los km. Según el dueño, **los km mal cargados en sus remitos son
  errores de los playeros**, no del conductor. En general, un km inválido a nombre de un conductor **puede ser error del playero**, o que no se le informó el km.
  La tabla "por chofer" del Informe muestra a nombre de quién quedó la carga, no a quién se le atribuye el error.
- **Contexto de uso del AG281ZJ:** reparto al interior de Chaco. Salió el 23/09, cargó ese día en Colonia Benítez (mañana o siesta) y el 25/09, de regreso,
  cargó en Pampa del Infierno (a unos 300 km del depósito) llenando el tanque. Volvió a llenar recién el 30/09. Las cargas de ese camión en ese lugar suelen
  ocurrir "de vuelta", con unos 300–350 km todavía por recorrer hasta el depósito.
- **Caso abierto:** tramo AG281ZJ 23→25/09, odómetro declarado 297 km; el GPS exige entre 460 y 803 km. Los tramos vecinos (21→23: 678 km dentro de 449–852;
  25→30: 615 km dentro de 225–666) solo cierran si **la lectura del 23/09 (143.112) está tipeada alta entre 113 y 279 km** (real ≈ 142.833–142.999),
  **o la del 25/09 (143.409) está tipeada baja por 113 km o más**. Verificar con el remito/foto de esa carga.
  **Actualización (4/11):** el dueño informa que el 25/09 tenía ≈ 143.350 km (coincide con el 143.409 declarado). Con eso, todo cuadra: 143.350 + GPS posterior da
  144.015 el 30/09 (declarado 144.024), 144.985 el 07/10 (service 145.000) y **148.185–148.375 km al 31/10**. El que queda sospechoso es el del 23/09 (143.112): probable
  error del playero (real ≈ 142.833–142.999). Km vigente a corregir en la ficha: ≈ 148.390 (service 07/10 + GPS posterior); hoy figura 213.000 por un registro mal cargado.
- **Renault:** un tanque lleno rinde entre 400 y 500 km (≈ 9–11 L/100 km). La carga del 26/09 del AG416OE (29,75 L) completó el tanque.
- **Mantenimientos y Reparaciones:** los km se anotan en el taller leyendo el tablero (a veces redondeados): se tratan como lecturas **confiables** del vehículo.
- **Los vehículos dados de baja** conservan todo su historial (estadística histórica y respaldo legal); el 08 y fotos se guardan como documento del vehículo.

## Pendientes de datos para que el re-análisis sirva
- Cargar el archivo de combustible de YPF de **octubre** y siguientes (hoy octubre tiene solo GPS).
- Cargar la capacidad real del tanque de cada vehículo y confirmar los km base de los vehículos sin GPS.
- Confirmar con remitos los casos abiertos (AG281ZJ 23→25/09; AH387NS y OQK804 con muchas lecturas inválidas: revisar su tablero).
