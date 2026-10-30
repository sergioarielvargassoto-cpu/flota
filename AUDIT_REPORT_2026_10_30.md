# 🔍 AUDITORÍA COMPLETA FLOTA - 2026-10-30

## 📋 Resumen Ejecutivo

Auditoría profunda con 6 agentes especializados + Code Review Ultra. **7 CRÍTICOS**, **12 ALTOS**, **11 MEDIOS**

---

## 🔴 CRÍTICOS (7)

### 1. km_history - Migración Incompleta ⚠️ RUNTIME CRASH
- **Archivo**: supabase/migrations/0003_km_history.sql
- **Problema**: Falta columnas `km_previous` y `changed_by` definidas en types.ts
- **Impacto**: `recordKmChange()` en history.ts:8,10 falla. `audit.ts:48` accede a `curr.km_previous` → CRASH
- **Fix**: 
  ```sql
  ALTER TABLE km_history ADD COLUMN km_previous int;
  ALTER TABLE km_history ADD COLUMN changed_by text;
  ```

### 2. RLS Policies Demasiado Permisivas
- **Archivos**: 0001_schema.sql, 0002_km_reports.sql, 0003_km_history.sql
- **Problema**: `using (true) with check (true)` → cualquier usuario autenticado ve/modifica TODO
- **Afecta**: vehicles, drivers, repairs, maintenance, fuel_loads, documents, infractions
- **Riesgo**: Robo de datos, modificación de km/costos de competencia
- **Fix**: Filtrar por rama/organización o usuario_id

### 3. RLS Delete Policy en History Tables
- **Archivo**: 0003_km_history.sql
- **Problema**: Permite DELETE a cualquier usuario autenticado
- **Fix**: `CREATE POLICY "km_history_delete" ON km_history FOR DELETE USING (false);`

### 4. recordKmChange - changed_by Hardcodeado
- **Archivo**: src/lib/history.ts:10
- **Problema**: `changed_by: 'usuario'` → nunca registra quién realmente hizo el cambio
- **Impacto**: Imposible auditar quién actualizó km manualmente
- **Fix**: Pasar userId desde auth context

### 5. FormModal Validación Genérica
- **Archivo**: src/components/FormModal.tsx:65
- **Problema**: `alert('Completá: ' + label)` sin highlight del campo
- **UX**: Usuario no sabe cuál campo específico está vacío si muchos están incompletos
- **Fix**: Mostrar error inline con field highlight rojo

### 6. Race Condition en reload()
- **Archivo**: src/lib/data.tsx:97
- **Problema**: Múltiples `await reload()` simultáneos pueden sobrescribir estado
- **Escenario**: 2 formularios se guardan al mismo tiempo → ambos reloading race
- **Fix**: Agregar flag `isReloading` para prevenir reload concurrente

### 7. xlsx - Vulnerabilidades HIGH
- **Package**: xlsx en package.json
- **CVEs**: 
  - GHSA-4r6h-8v6p-xvw6 (Prototype Pollution)
  - GHSA-5pgg-2g8v-p4x9 (ReDoS)
- **Impacto**: DoS en importación Excel malicioso, contaminación de objetos
- **Fix**: Buscar alternativa (papaparse, exceljs) o actualizar xlsx a versión sin vulns

---

## 🟠 ALTO (12)

### 1. FK Delete Policies - CASCADE debería ser RESTRICT
- **Afecta**: fuel_loads→vehicles, documents→vehicles, trips→vehicles
- **Problema**: Borrar vehículo borra combustible/documentos/recorridos completo
- **Fix**: `ON DELETE RESTRICT`

### 2. Attachments - Sin Validación MIME Type
- **Archivo**: src/components/Attachments.tsx:14-23
- **Problema**: Solo valida tamaño (10MB), acepta .exe, .zip, scripts
- **Fix**: Whitelist MIME types (application/pdf, image/*, etc)

### 3. Tablas sin RLS Explícito
- **Tablas**: vehicles, drivers, repairs, maintenance, fuel_loads, documents, infractions, fines, workshops
- **Problema**: Solo km_reports/history tienen RLS
- **Fix**: ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...

### 4. Falta infraction_id en Attachments (SQL)
- **Archivo**: src/lib/types.ts:30 define `infraction_id`
- **Pero**: 0001_schema.sql:135 no lo crea en tabla attachments
- **Fix**: `ALTER TABLE attachments ADD COLUMN infraction_id uuid REFERENCES infractions(id) ON DELETE CASCADE;`

### 5. combustible/page.tsx - Keys Basadas en Index
- **Línea**: 59 → `key={i}` en `sum.map((x, i) => ...)`
- **Problema**: sum está reordenado por `.sort((a,b) => b.imp - a.imp)`. Si datos cambian, click va a vehículo equivocado
- **Fix**: `key={x.v?.id}`

### 6. ImportDialog.tsx - Keys Basadas en Index
- **Línea**: 30 → `key={i}` en headers.map
- **Fix**: Si headers tiene IDs, usarlos; sino no reasignar

### 7. Inconsistencia Select Options Format
- **Archivo**: src/components/forms.tsx:38
- **Problema**: provincia usa `[['', 'label'], ['Corrientes', 'Corrientes']]` pero status usa `['Activo', 'En taller']`
- **Fix**: Normalizar todos a array de tuplas

### 8. FormModal - Error Handling Frágil
- **Línea**: 73 → `(err as any).originalError` luego `(err as { message?: string })?.message`
- **Problema**: Si error no es Error, puede silenciar el problema real
- **Fix**: `err instanceof Error ? err : new Error(String(err))`

### 9. Sin CI/CD Pipeline
- **Problema**: No hay .github/workflows/, sin GitHub Actions
- **Afecta**: Sin linting obligatorio en PRs, sin tests en CI, sin pre-commit hooks
- **Fix**: Agregar workflow básico (lint + tests)

### 10. next.config.mjs Minimalista
- **Problema**: Sin optimizaciones de producción, sin compresión, sin headers seguridad
- **Fix**: Agregar image optimization, headers, redirects

### 11. .env.example Incompleta
- **Problema**: Solo tiene NEXT_PUBLIC_SUPABASE_*
- **Falta**: ¿Se usa service_role_key en server actions?
- **Fix**: Documentar todas las variables necesarias

### 12. Importadores - Sin Validación de Tipos
- **Archivo**: src/lib/importers.ts:66-82
- **Problema**: pNum(), pDate() sin validación, fallan silenciosamente si valores inválidos
- **Impacto**: Filas descartadas sin feedback al usuario
- **Fix**: Mostrar errores detallados en UI

---

## 🟡 MEDIO (11)

### 1. Índices Faltantes
- **Tablas**: drivers (DNI, nombre), documents, workshops
- **Columnas**: status, branch (usadas en filtros)
- **Fix**: CREATE INDEX drivers_dni_idx ON drivers(dni); etc

### 2. Sin UNIQUE Constraint - documents
- **Problema**: Podría haber vencimientos duplicados (vehicle_id + doc_type)
- **Fix**: CREATE UNIQUE INDEX documents_vehicle_doc_type_idx ON documents(vehicle_id, doc_type) WHERE vehicle_id IS NOT NULL;

### 3. km_reports - Sin UNIQUE Constraint
- **Problema**: Podría importarse mismo mes/año dos veces
- **Fix**: CREATE UNIQUE INDEX km_reports_vehicle_month_year_idx ON km_reports(vehicle_id, month, year);

### 4. Sin Pre-Deploy Checks
- **Problema**: Migraciones Supabase (0004_provincia.sql) no se ejecutan automáticamente en deploy
- **Risk**: Vercel deploy antes de migración → app no funciona
- **Fix**: Script pre-deploy que ejecute migraciones

### 5. Forms - Cast sin Validación
- **Archivo**: src/components/forms.tsx:52,58
- **Problema**: `vals.km as number` pero vals.km puede ser null
- **Fix**: `vals.km ?? null` antes de cast

### 6. types.ts - doc_type sin Enum
- **Problema**: `doc_type: string` debería tener tipos fijos
- **Fix**: `type DocType = 'Licencia' | 'VTV' | 'Seguro' | ...`

### 7. Comparaciones sin Type Guard
- **Archivo**: src/components/forms.tsx:140-142
- **Problema**: `r?.cost !== vals.cost` → cost es number|null, comparación frágil
- **Fix**: Normalizar a string o number antes de comparar

### 8. settings.local.json Committed
- **Problema**: `.local.json` es user/machine-specific, no debería estar en git
- **Fix**: Agregar a .gitignore, usar solo .env.local

### 9. AGENTS.md Auto-Generado no en .gitignore
- **Problema**: Auto-generado por `next dev`, aparecerá siempre como untracked
- **Fix**: Agregar a .gitignore

### 10. Curl Pattern en settings.local.json
- **Problema**: `Bash(curl -s http://localhost:3000)` muy restrictivo
- **Fix**: Cambiar a `Bash(curl *)`

### 11. Falta Documentación
- **Falta**: README.md, CLAUDE.md, instrucciones de setup
- **Falta**: Comentarios en funciones complejas
- **Fix**: Crear README con setup, deploy, migraciones

---

## ✅ LO QUE FUNCIONA BIEN

- useData hook bien implementado, dependencies correctas
- Context pattern es sound
- Insert/update/delete flujo coherente
- No hay N+1 queries visibles
- Listas grandes tienen paginación (1000 filas limit)
- Migrations son idempotentes (IF NOT EXISTS)

---

## 📅 PLAN DE ACCIÓN

### **Día 1 - CRÍTICOS (4-5 horas)**
- [ ] Migración SQL: agregar km_previous, changed_by a km_history
- [ ] Fix recordKmChange: pasar userId real
- [ ] Fix race condition reload(): agregar flag isReloading
- [ ] FormModal: validación inline, field highlight
- [ ] Vulnerabilidad xlsx: reemplazar o mitigation strategy

### **Día 2 - ALTO (6-8 horas)**
- [ ] RLS policies: actualizar todas las tablas
- [ ] FK DELETE CASCADE → RESTRICT
- [ ] Attachments: MIME type validation + whitelist
- [ ] Corregir keys en listas (combustible, import)
- [ ] Normalizar select options format
- [ ] ESLint + Prettier config + pre-commit hooks

### **Día 3 - MEDIO (4-5 horas)**
- [ ] Índices faltantes
- [ ] UNIQUE constraints
- [ ] Enum para doc_type
- [ ] Documentación (README, CLAUDE.md)
- [ ] .gitignore fixes

### **Opcional - Optimizaciones**
- [ ] GitHub Actions CI/CD
- [ ] next.config optimizaciones
- [ ] Security headers
- [ ] Rate limiting

---

**Generado por**: Auditoría automática con 6 agentes + Code Review Ultra  
**Fecha**: 2026-10-30  
**Tiempo de auditoría**: ~4 minutos (análisis paralelo)
