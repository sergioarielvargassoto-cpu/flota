# Análisis estadístico de calibración · 4/11/2026

Datos: combustible solo de **septiembre** (115 cargas de combustible; octubre aún sin archivo de YPF). GPS de septiembre y octubre (12 de 21 vehículos).
Alcance honesto: un solo mes de combustible → los resultados orientan, no fijan parámetros definitivos. Recalibrar con octubre y noviembre.

## 1. Odómetro vs GPS (26 tramos limpios entre lecturas válidas, 8 vehículos con GPS)
- **25 de 26 tramos (96 %) caen dentro del rango posible de GPS** (mínimo = días completos entre cargas; máximo = más los dos días de las cargas).
- Escala global odómetro/GPS = **0,988** (regresión por el origen): el GPS prácticamente no tiene desfasaje.
- Por vehículo (con ≥2 tramos): AE547NW 0,992 · AF630PC 1,000 · AE615LU 1,024 · AE149OR 0,953 · AH530QG 1,086 · **AG281ZJ 0,935**. Hay un factor propio de cada vehículo (±5–9 %), no un patrón por tipo (el "camión" es solo AG281ZJ).
- **Sensibilidad:** probando márgenes de 0 a 150 km (y 0–5 %), el resultado es siempre el mismo (1 tramo fuera de 26). El margen elegido no condiciona las conclusiones; lo que importa es usar un rango y no un valor único.
- Único tramo fuera de rango: AG281ZJ 23→25/09 (odómetro 297 km; el GPS no admite menos de 460).

## 2. Consumo por vehículo (regresión de litros acumulados sobre km)
- Ajuste R² entre 0,976 y 1,000 en todos los vehículos con ≥3 lecturas válidas. Intercepto ≈ 0 en casi todos (se carga con el tanque lleno de forma consistente).
- L/100 km: utilitarios 9,2 · 10,3 · 9,3 · 9,5 y **7,4 (AH530QG, el más bajo; con odómetro +8,6 % sobre el GPS; con km de GPS daría ≈ 8,0)**; auto Sandero 9,0; camionetas 10,5–13,6; camión AG281ZJ 24,4 y AC820YH 16,6 (3 lecturas, intercepto +60 L: dato dudoso).
- Banda de desvío por tipo (provisoria): utilitario/auto 15 %, camioneta/furgón 20 %, camión 30 %, otros 25 %. Combinada siempre con el margen por tanque (capacidad ÷ km de la ventana).

## 3. Lecturas de odómetro inválidas (21 de 115, 18,3 %)
- **No se distribuyen al azar** (prueba de permutación, 5.000 repeticiones): por vehículo p<0,0001, por conductor p<0,0001, por estación p≈0,009.
- Se concentran en pocos **vehículos**, cada uno con más de un conductor: OQK804 4/4, AH387NS 4/6, AG281ZJ 3/11, AH530QG 3/7. Conductor, vehículo y estación están mezclados con pocos datos, pero el efecto por vehículo (estadístico más alto) sugiere revisar el **tablero/odómetro y la carga del km** de esas unidades, no solo a los choferes.
- Intervalos de confianza (Wilson 95 %) de km válidos por conductor: casi todos se superponen. Estadísticamente distinguibles: **Cazal 0/6 (IC 0–39 %)** y **Acevedo 2/5 (IC 12–77 %)** por debajo del resto; **Cáceres Jorge 14/15, Congo Lisandro 13/13 y Mourglia Javier 9/9** con historial confiable. Cáceres Nahuel (6/9, IC 35–88 %) y Bonett (3/6) no se pueden distinguir del resto con tan pocos datos.

## 4. Regla física de plausibilidad (nueva)
- Distancia máxima posible entre dos lecturas = (litros de la carga + capacidad del tanque) ÷ 3,5 L/100 km. Sobre 77 tramos aceptados rechaza **1**: AA726SG 02→08/09, 2.400 km con 20,7 L (máximo posible 1.733). Sin falsos positivos en los otros 76.

## 5. Otras verificaciones
- Cargas en días sin movimiento GPS: solo el Sandero (7 cargas, GPS caído en septiembre).
- Precio por litro: dispersión entre estaciones el mismo día ≤ 6 %; sin señales de sobrefacturación.
- Los bidones de AdBlue (≈25–26 mil $ por unidad) se contabilizan en el gasto, no en litros.

## Cambios aplicados a partir del análisis
1. Rango de GPS (mín–máx) en lugar de un valor único en todas las comparaciones.
2. Bandas de consumo por tipo de vehículo.
3. Regla física de plausibilidad al importar combustible.
4. Confiabilidad por conductor con intervalo de confianza (alta / media / baja / pocas cargas), usada para orientar dónde mirar cuando un tramo no cierra.

## Pendiente para recalibrar (con octubre y noviembre)
- Factor de escala propio por vehículo (odómetro/GPS) cuando haya ≥6 tramos por unidad.
- Bandas de consumo por tipo con más vehículos y meses (hoy 1–5 vehículos por tipo).
- Cargar el combustible de octubre (hoy el informe de octubre tiene solo GPS).
