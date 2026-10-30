// Backup completo de Supabase: todas las tablas (JSON + Excel) y archivos del bucket 'adjuntos'.
// Uso (PowerShell):
//   $env:FLOTA_EMAIL='tu@email'; $env:FLOTA_PASSWORD='...'; node scripts/backup.mjs
// o con service role key:
//   $env:SUPABASE_SERVICE_ROLE_KEY='...'; node scripts/backup.mjs
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const TABLES = [
  'settings',
  'vehicles',
  'drivers',
  'documents',
  'workshops',
  'repairs',
  'maintenance',
  'fuel_loads',
  'trips',
  'attachments',
  'infractions',
  'fines',
  'km_reports',
  'km_history',
  'repair_history',
  'maintenance_history',
];
const BUCKET = 'adjuntos';
const PAGE = 1000;

function loadEnvLocal() {
  const f = path.resolve('.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

async function fetchAll(sb, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function listFiles(sb, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
    for (const item of data) {
      const p = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listFiles(sb, p)));
      else out.push(p);
    }
    if (data.length < PAGE) return out;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, service || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  if (!service) {
    const email = process.env.FLOTA_EMAIL;
    const password = process.env.FLOTA_PASSWORD;
    if (!email || !password) {
      console.error('Faltan FLOTA_EMAIL / FLOTA_PASSWORD (o SUPABASE_SERVICE_ROLE_KEY).');
      process.exit(1);
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Login: ${error.message}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.resolve('backups', stamp);
  fs.mkdirSync(path.join(dir, 'tablas'), { recursive: true });

  const wb = XLSX.utils.book_new();
  const summary = { fecha: new Date().toISOString(), proyecto: url, tablas: {}, archivos: 0, errores: [] };

  for (const t of TABLES) {
    try {
      const rows = await fetchAll(sb, t);
      fs.writeFileSync(path.join(dir, 'tablas', `${t}.json`), JSON.stringify(rows, null, 2));
      const flat = rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]),
        ),
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), t.slice(0, 31));
      summary.tablas[t] = rows.length;
      console.log(`✓ ${t}: ${rows.length}`);
    } catch (e) {
      summary.errores.push(String(e.message || e));
      console.error(`✗ ${e.message || e}`);
    }
  }
  XLSX.writeFile(wb, path.join(dir, 'flota_backup.xlsx'));

  try {
    const files = await listFiles(sb);
    for (const f of files) {
      const { data, error } = await sb.storage.from(BUCKET).download(f);
      if (error) {
        summary.errores.push(`archivo ${f}: ${error.message}`);
        continue;
      }
      const dest = path.join(dir, BUCKET, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
      summary.archivos++;
    }
    console.log(`✓ archivos (${BUCKET}): ${summary.archivos}`);
  } catch (e) {
    summary.errores.push(String(e.message || e));
    console.error(`✗ ${e.message || e}`);
  }

  fs.writeFileSync(path.join(dir, 'resumen.json'), JSON.stringify(summary, null, 2));
  console.log(`\nBackup guardado en: ${dir}`);
  if (summary.errores.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
