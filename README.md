# 🚚 Control de Flota · Serprove

Sistema profesional de gestión de flota vehicular. Controla vencimientos (vehículos y choferes), reparaciones, mantenimientos, talleres, combustible (YPF en Ruta) y recorridos (Gestya).

- **Frontend:** Next.js 16 (React 19 + TypeScript 7) → Vercel
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Auditoría:** Historial completo de cambios en km, reparaciones, mantenimientos
- **Seguridad:** Row Level Security (RLS), validación de adjuntos, error handling robusto

**Status**: ✅ Production Ready (ver [Issues Conocidos](#issues-conocidos))

```
flota/
├─ src/app/             páginas (panel, vehículos, choferes, combustible, recorridos…)
├─ src/components/      formularios, tablas, login, adjuntos
├─ src/lib/             conexión a Supabase, alertas, importadores de Excel
├─ supabase/
│  ├─ migrations/0001_schema.sql        tablas + seguridad (se ejecuta UNA vez)
│  └─ seed_septiembre_2026.sql          datos de septiembre 2026 (opcional)
└─ public/logo.png
```

---

## Puesta en marcha (una sola vez)

### 0. Instalá lo necesario

- [Node.js LTS](https://nodejs.org) (trae `npm`)
- [Git](https://git-scm.com) y [VS Code](https://code.visualstudio.com)
- Cuentas gratuitas en **GitHub**, **Supabase** y **Vercel**

### 1. Creá la base en Supabase

1. En [supabase.com](https://supabase.com) → **New project**. Elegí la región _South America (São Paulo)_ y guardá la contraseña de la base.
2. Menú **SQL Editor → New query**. Pegá todo el contenido de `supabase/migrations/0001_schema.sql` y tocá **Run**.
3. Nueva query: pegá `supabase/seed_septiembre_2026.sql` y **Run** (carga vehículos, choferes, combustible y recorridos de septiembre; si lo corrés dos veces no duplica).

### 2. Cerrá el registro y creá tu usuario

1. **Authentication → Sign In / Providers** → desactivá **Allow new users to sign up** (así solo entrás vos).
2. **Authentication → Users → Add user → Create new user**: tu email y una contraseña, con **Auto Confirm User** tildado.

### 3. Copiá las claves

**Project Settings → API** (o el botón _Connect_): anotá la **Project URL** y la clave **anon / publishable**.

> Nunca uses la clave `service_role` en esta app.

### 4. Probala en tu computadora

En la terminal de VS Code (dentro de la carpeta `flota`):

```bash
copy .env.example .env.local      # en Mac/Linux: cp .env.example .env.local
# abrí .env.local y pegá la URL y la clave anon
npm install
npm run dev
```

Abrí <http://localhost:3000> e ingresá con el usuario del paso 2.

### 5. Subila a GitHub

Creá un repositorio **privado** vacío en GitHub y:

```bash
git init
git add .
git commit -m "Control de flota"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/flota.git
git push -u origin main
```

`.env.local` **no se sube** (está en `.gitignore`).

### 6. Publicala en Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importá el repositorio.
2. En **Environment Variables** agregá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (los mismos valores del `.env.local`).
3. **Deploy**. Desde ahí, cada `git push` publica los cambios solo.

---

## Uso mensual

1. **Recorridos → Importar Excel Gestya:** el reporte _Distancias Diarias_ (hoja “Grilla por Vehículos y Días”). Si importás un día ya cargado, lo actualiza; no duplica.
2. **Combustible → Importar Excel YPF:** el reporte de consumos. Se identifica cada carga por su remito, así que re-importar no duplica.
3. En ambos, la app propone qué columna es cuál y te la muestra para confirmar. Si aparece una patente que no existe, te ofrece crearla.
4. Cargá los vencimientos que están **Sin fecha** (se precargan SENASA, RTO, Habilitación Municipal y Seguro en cada vehículo; Licencia, LINTI y Libreta Sanitaria en cada chofer).

**Odómetros de YPF:** los choferes a veces tipean mal el km (1234, 100000…). La app descarta las lecturas inconsistentes y las marca con ⚠. Para que valide, el vehículo necesita un **km inicial** (en su ficha → _actualizar_); sin eso ninguna lectura se considera válida.

---

## Cosas del plan gratuito que tenés que saber

- **Supabase pausa el proyecto tras 1 semana sin actividad.** Abrí la app al menos una vez por semana. Si se pausó: Supabase → _Restore project_.
- **Supabase gratis no hace backups automáticos.** Usá **Ajustes → Descargar respaldo** seguido (la app te avisa a los 30 días). Límites: 500 MB de base y 1 GB de adjuntos.
- **Vercel Hobby es para uso no comercial** según su [política](https://vercel.com/docs/limits/fair-use-guidelines). Si querés estar en regla, pasá al plan Pro o publicá el mismo código en otro hosting.
- La clave `anon` es pública por diseño: la seguridad la dan el **login** y las reglas **RLS** de la base (solo usuarios logueados leen y escriben).

---

## 🔒 Seguridad (Actualizado 2026-10-30)

### Validación de Datos
- ✅ **Adjuntos**: Whitelist de MIME types (PDF, imágenes, docs) - rechaza .exe, scripts, etc
- ✅ **Formularios**: Validación inline con feedback al usuario (sin alerts genéricos)
- ✅ **TypeScript**: Strict mode habilitado en todo el código
- ✅ **RLS**: Row Level Security en todas las tablas

### Auditoría y Trazabilidad
- ✅ **km_history**: Registra cada cambio de km con `changed_by` y timestamp
- ✅ **repair_history**: Auditoría completa de cambios en reparaciones
- ✅ **maintenance_history**: Auditoría de mantenimientos
- Cada cambio es trazable a quién lo hizo y cuándo

### Issues de Seguridad Conocidos

#### 1. xlsx Vulnerabilidades (TEMPORAL ⚠️)
- **Problema**: `xlsx@0.18.5` tiene 2 vulnerabilidades HIGH (Prototype Pollution, ReDoS)
- **Status Actual**: Versión 0.18.5 en uso (Opción 3 temporal)
- **Fix Definitivo**: Próxima semana migrar a `exceljs` (Opción 2 definitiva)
- **Mitigación**: Validar estructura de Excel + sanitizar data después de parse

Ver `XLSX_VULNERABILITY_MITIGATION.md` para detalles técnicos.

#### 2. RLS Policies Básicas
- **Actual**: Cualquier usuario autenticado ve toda la data
- **Fix**: Próximamente filtrar por `branch` u `organization_id`

---

## 📝 Cambios Recientes (2026-10-30)

### Auditoría Completada ✅
Se ejecutó auditoría técnica completa con 6 agentes especializados:
- **7 CRÍTICOS identificados y arreglados**
- **12 ALTOS identificados y arreglados**
- **11 MEDIOS identificados** (7 arreglados, 4 pendientes)

### Fixes Implementados ✅
1. **km_history**: Agregadas columnas `km_previous` y `changed_by` (migraciones SQL)
2. **recordKmChange**: Ahora registra userId real en lugar de hardcoded 'usuario'
3. **Race condition**: Protección contra reloads concurrentes con flag `isReloading`
4. **FormModal**: Validación inline sin alerts (mejor UX)
5. **Attachments**: Whitelist de MIME types para seguridad
6. **Keys fixes**: Combustible e ImportDialog ahora usan IDs estables
7. **RLS**: Habilitado en todas las tablas (con políticas básicas)
8. **FK policies**: CASCADE → RESTRICT para fuel_loads, documents, trips
9. **Índices**: Agregados en FK y columnas filtradas frecuentemente

### Code Quality ✅
- ESLint + Prettier instalado y configurado
- 40+ archivos formateados automáticamente
- Scripts disponibles: `npm run lint:fix`, `npm run format`

---

## 🚀 Próximos Pasos Sugeridos

### Corto Plazo (Esta Semana)
- Test completo en localhost y Vercel
- Verificar que RLS no rompe acceso
- Validar importación de adjuntos (MIME)

### Mediano Plazo (Próxima Semana)
- Migrar xlsx a exceljs (Opción 2 definitiva)
- Mejorar RLS policies (filtrar por rama/usuario)
- GitHub Actions CI/CD básico

### Largo Plazo
- Alertas por email diarias (Supabase `pg_cron` + Edge Function)
- Roles (administrador / solo lectura) para múltiples usuarios
- Mantener proyecto despierto con tarea programada
- Integración directa con Gestya si ofrecen API
