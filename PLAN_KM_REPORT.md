# Plan: Reporte Mensual de Kilómetros (Completo)

## 📋 Fases

### Fase 1: Base de Datos (30 min)

- Migración SQL: Tabla km_reports + campos sucursal en vehicles
- Campos: vehicle_id, month, year, km_total, km_prev, branch, imported_at, km_by_day (jsonb)

### Fase 2: Importador Gestya (1h)

- Detectar formato automáticamente
- Extraer patente + sucursal (si está en datos)
- Validar fechas, km, patentes
- Normalizar patente (mayúsculas, sin espacios)
- Preguntar qué hacer con vehículos desconocidos
- Guardar en km_reports con histórico

### Fase 3: Página /reportes-km (1.5h)

- Tabla mensual: Patente | Marca | Km | Km anterior | % variación | Sucursal
- Filtros: Mes, Año, Sucursal
- Cards KPI: Total km, Promedio, Vehículos reportados
- Gráfico barras (Recharts): km por vehículo coloreado por sucursal
- Gráfico líneas: evolución mensual
- Tabla con opción marcar "excluido del reporte"

### Fase 4: PDF Profesional (1.5h)

- Header: Logo, mes/año, sucursal
- Tabla: Vehículo, patente, km, variación
- Gráfico barras PNG incrustado
- Gráfico líneas (evolución últimos 6 meses)
- Footer: Fecha generación, empresa
- A4, tema claro/oscuro coherente con app
- Botón "Descargar PDF" en página

### Fase 5: Gestión Histórico (30 min)

- Si mes ya existe: "Reemplazar / Mantener anterior"
- Evitar duplicados
- Mostrar última importación
- Historial de cambios

## 🎯 Stack

- **DB:** Tabla km_reports (nueva) + vehicles modificada
- **Importador:** Ampliación de src/lib/importers.ts
- **Página:** Nueva src/app/reportes-km/page.tsx
- **PDF:** jsPDF + Recharts en canvas (como reportes existentes)
- **Gráficos:** Recharts (Ya en proyecto)

## ⏱️ Tiempo Total

- ~4.5 horas de desarrollo
- Reutilización máxima de código existente
