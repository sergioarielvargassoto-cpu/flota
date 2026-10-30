# Control de Flota · Serprove

Web para controlar vencimientos (vehículos y choferes), reparaciones, mantenimientos, talleres, combustible (YPF en Ruta) y recorridos (Gestya).

- **Web:** Next.js (React + TypeScript) → se publica en **Vercel**
- **Base de datos, login y archivos adjuntos:** **Supabase** (Postgres)
- **Todo en esta carpeta**, versionado con Git

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

## Próximos pasos sugeridos

- Alertas por email todos los días (Supabase `pg_cron` + Edge Function), así avisa aunque no abras la app.
- Roles (administrador / solo lectura) si sumás más usuarios.
- Mantener el proyecto despierto con una tarea programada.
- Integración directa con Gestya si ofrecen API.
