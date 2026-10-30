# Plan: Análisis Avanzado de Conductores, Costos y Sucursales

**Objetivo:** Implementar 3 análisis profesionales reutilizando datos existentes
**Modelo:** Mismo enfoque que reporte KM (tabla + gráficos + PDF)
**Tiempo estimado:** 6-7 horas (incremental)

---

## 📊 Análisis 1: Conductores (2.5h)

### Datos Necesarios

- `infractions` → infracciones por conductor
- `trips` → máx velocidad por conductor (via vehicle_id → driver_id)
- `fuel_loads` → combustible consumido

### Métricas por Conductor

```
- Total infracciones (count)
- Infracciones pendientes de pago (status != 'Pagada')
- Multas acumuladas (sum fine_amount)
- Días con exceso velocidad (trips.max_speed > 120)
- Días totales conduciendo (distinct trips.date)
- Eficiencia: km_total / litros_consumidos
- Rating seguridad: 0-100 (basado en infracciones + excesos)
```

### Componentes

- **Página:** `/reportes-conductores`
- **Tabla:** Conductor | Infracciones | Pendientes | Multas | Días exceso | Eficiencia | Rating
- **Filtros:** Mes, Año, Sucursal
- **Gráficos:**
  - Ranking infracciones (barras)
  - Rating seguridad (scatter: infracciones vs excesos)
  - Eficiencia km/litro (barras)
- **PDF:** Reporte con tabla + ranking + ratings

---

## 💰 Análisis 2: Costos por Vehículo (2.5h)

### Datos Necesarios

- `fuel_loads` → costo combustible
- `repairs` → costo reparaciones
- `maintenance` → costo mantenimiento
- `fines` → monto pagado multas
- `km_reports` → km recorridos

### Métricas por Vehículo

```
- Costo combustible (sum amount)
- Costo reparaciones (sum cost)
- Costo mantenimiento (sum cost)
- Multas pagadas (sum paid_amount)
- Total costos = sum(todo lo anterior)
- Km recorridos = km_reports.km_total
- Costo por km = total / km
- Comparativa: este mes vs mes anterior (%)
- Comparativa: este año vs año anterior
```

### Componentes

- **Página:** `/reportes-costos`
- **Tabla:** Patente | Combustible | Reparaciones | Mantenimiento | Multas | Total | Costo/km
- **Filtros:** Mes, Año, Sucursal, Tipo gasto
- **Gráficos:**
  - Stack bar: composición de gastos por vehículo
  - Line: evolución costo/km (últimos 12 meses)
  - Pie: % distribución gastos (combustible vs otros)
- **PDF:** Reporte con tabla + gráficos + ranking más costosos

---

## 🏢 Análisis 3: Comparativas por Sucursal (1.5h)

### Datos Necesarios

- `vehicles.branch` → sucursal
- Todos los análisis anteriores agrupados por branch

### Métricas por Sucursal (mes/año)

```
- Total km
- Total combustible (litros)
- Costo promedio/km
- Infracciones totales
- Conductores (count)
- Vehículos activos (count)
- Rating promedio seguridad
- Eficiencia promedio km/litro
```

### Componentes

- **Sección:** Tab en dashboard o página `/reportes/sucursales`
- **Tabla:** Sucursal | Km | Combustible | Costo/km | Infracciones | Rating | Eficiencia
- **Gráficos:**
  - Barras: comparativa de costos/km entre sucursales
  - Barras: infracciones por sucursal
  - Scatter: eficiencia vs infracciones (bubble size = km)

---

## 🗂️ Estructura de Carpetas

```
src/
├── app/
│   ├── reportes-conductores/
│   │   └── page.tsx
│   ├── reportes-costos/
│   │   └── page.tsx
│   └── reportes/
│       ├── page.tsx (dashboard principal)
│       └── sucursales.tsx (tab dentro de reportes)
│
├── lib/
│   ├── analisisHelpers.ts (funciones reutilizables)
│   ├── conductorPdf.ts
│   ├── costosPdf.ts
│   └── reportesUtils.ts (formateo, cálculos comunes)
│
└── components/
    ├── AnalysisCard.tsx (componente reutilizable)
    └── ComparisonChart.tsx
```

---

## 🔄 Flujo de Datos

```
BASE DE DATOS
├── vehicles (plate, branch, driver_id)
├── drivers (id, name)
├── infractions (driver_id, status, fine_amount, date)
├── fuel_loads (vehicle_id, amount, liters, date)
├── repairs (vehicle_id, cost, date)
├── maintenance (vehicle_id, cost, date)
├── trips (vehicle_id, max_speed, date)
└── km_reports (vehicle_id, km_total, month, year, branch)

ANÁLISIS CONDUCTORES
→ Agrupar por driver_id
→ Sumar infracciones + excesos + consumo
→ Calcular rating

ANÁLISIS COSTOS
→ Agrupar por vehicle_id
→ Sumar combustible + reparaciones + mantenimiento + multas
→ Dividir por km

COMPARATIVAS SUCURSAL
→ Agrupar todo por branch
→ Mostrar KPIs agregados
```

---

## 📋 Fases de Implementación

### Fase 1: Helpers & Tipos (30 min)

- [ ] Crear tipos TypeScript para cada análisis
- [ ] Funciones de cálculo reutilizables
- [ ] Utilidades de formateo

### Fase 2: Análisis Conductores (2h)

- [ ] Página `/reportes-conductores`
- [ ] Tabla + gráficos
- [ ] PDF de reporte
- [ ] Filtros (mes, año, sucursal)

### Fase 3: Análisis Costos (2h)

- [ ] Página `/reportes-costos`
- [ ] Tabla + gráficos
- [ ] PDF de reporte
- [ ] Filtros + comparativas

### Fase 4: Comparativas Sucursal (1.5h)

- [ ] Sección en dashboard o nueva página
- [ ] Tabla comparativa
- [ ] Gráficos de benchmark

### Fase 5: Pulido (30 min)

- [ ] Build + testing
- [ ] Commit + deploy
- [ ] Actualizar memoria

---

## ✨ Diferenciales Profesionales

✅ **Reutilización de código:**

- Mismo hook `useData()`
- Mismo patrón ImportDialog
- Mismos gráficos Recharts
- Mismo generador jsPDF

✅ **Consistencia visual:**

- Colores coherentes por sucursal
- Cards KPI iguales que en km_reports
- Tablas con mismo estilo
- PDFs profesionales

✅ **Performance:**

- Cálculos en memoria (no queries complejas)
- Maps/Sets para O(1) lookups
- Memoización donde aplique
- Gráficos renderizados dinámicamente

✅ **UX:**

- Filtros con validación
- Comparativas periodo anterior automáticas
- Tooltips en gráficos
- Exportación PDF profesional

---

## 📝 Notas Técnicas

### Cálculos Eficientes

```typescript
// En lugar de queries complejas, usar:
const driverStats = new Map();
for (const infraction of infractions) {
  if (!driverStats.has(infraction.driver_id)) {
    driverStats.set(infraction.driver_id, { count: 0, total: 0 });
  }
  const stat = driverStats.get(infraction.driver_id)!;
  stat.count++;
  stat.total += infraction.fine_amount ?? 0;
}
```

### Rating de Seguridad (0-100)

```
base = 100
- 15 por cada infracción
- 5 por cada día con exceso velocidad
- Mínimo: 0
- Máximo: 100
```

### Costo por KM

```
total_costo / km_recorridos
= (combustible + reparaciones + mantenimiento + multas) / km
```

---

## ⏱️ Timeline Total: 6-7 horas

| Fase           | Tiempo | Acumulado |
| -------------- | ------ | --------- |
| 1. Helpers     | 30 min | 30 min    |
| 2. Conductores | 2h     | 2h 30 min |
| 3. Costos      | 2h     | 4h 30 min |
| 4. Sucursales  | 1.5h   | 6h        |
| 5. Pulido      | 30 min | 6h 30 min |

---

## ✅ Checklist de Calidad

- [ ] Build sin errores TypeScript
- [ ] Filtros funcionan correctamente
- [ ] Gráficos se renderizan sin datos
- [ ] PDFs descargables y profesionales
- [ ] Tablas ordenables (por click en header)
- [ ] Comparativas mes anterior muestran %
- [ ] Sucursales se filtran correctamente
- [ ] Memory efficient (no memory leaks)
- [ ] Responsive (mobile & desktop)
- [ ] Commit + deploy a Vercel

---

## 🎯 Prioridad de Implementación

**Primero:** Conductores (alto impacto, datos ya existen)
**Segundo:** Costos (crítico para finanzas)
**Tercero:** Sucursales (requiere los anteriores)

¿Aprobado el plan? 👇
