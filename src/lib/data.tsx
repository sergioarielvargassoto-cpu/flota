'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sb } from './supabase';
import type {
  Attachment,
  Doc,
  Driver,
  Fine,
  Fuel,
  Infraction,
  KmReport,
  KmHistory,
  RepairHistory,
  MaintenanceHistory,
  Maint,
  Repair,
  Settings,
  TableName,
  Trip,
  Vehicle,
  Workshop,
} from './types';

type Tables = {
  vehicles: Vehicle[];
  drivers: Driver[];
  documents: Doc[];
  workshops: Workshop[];
  repairs: Repair[];
  maintenance: Maint[];
  fuel_loads: Fuel[];
  trips: Trip[];
  attachments: Attachment[];
  infractions: Infraction[];
  fines: Fine[];
  km_reports: KmReport[];
  km_history: KmHistory[];
  repair_history: RepairHistory[];
  maintenance_history: MaintenanceHistory[];
};

const EMPTY: Tables = {
  vehicles: [],
  drivers: [],
  documents: [],
  workshops: [],
  repairs: [],
  maintenance: [],
  fuel_loads: [],
  trips: [],
  attachments: [],
  infractions: [],
  fines: [],
  km_reports: [],
  km_history: [],
  repair_history: [],
  maintenance_history: [],
};
const DEFAULT_SETTINGS: Settings = {
  id: 1,
  company: 'Serprove',
  d1: 21,
  d2: 15,
  d3: 7,
  km_alert: 1000,
  service_km: 10000,
};
const ALL: TableName[] = [
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

/** Trae TODA la tabla (Supabase devuelve máx. 1000 filas por consulta, por eso se pagina). */
async function fetchAll<T extends { id: string }>(table: string): Promise<T[]> {
  const out: T[] = [];
  let lastId: string | null = null;
  while (true) {
    let q = sb().from(table).select('*').order('id').limit(1000);
    if (lastId) q = q.gt('id', lastId);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...((data ?? []) as T[]));
    if (data.length < 1000) break;
    lastId = data[data.length - 1].id;
  }
  return out;
}

type Ctx = Tables & {
  settings: Settings;
  loading: boolean;
  error: string | null;
  reload: (...t: TableName[]) => Promise<void>;
  insert: <T = { id: string }>(table: TableName, row: object) => Promise<T>;
  insertMany: (table: TableName, rows: object[]) => Promise<void>;
  update: (table: TableName, id: string, patch: object) => Promise<void>;
  remove: (table: TableName, id: string) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
};

const DataCtx = createContext<Ctx | null>(null);
export const useData = (): Ctx => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fuera del DataProvider');
  return c;
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Tables>(EMPTY);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  const reload = useCallback(
    async (...tables: TableName[]) => {
      if (isReloading) return;
      setIsReloading(true);
      try {
        const list = tables.length ? tables : ALL;
        const res = await Promise.all(list.map((t) => fetchAll(t)));
        setDb((prev) => {
          const next = { ...prev } as Record<string, unknown>;
          list.forEach((t, i) => (next[t] = res[i]));
          return next as Tables;
        });
      } finally {
        setIsReloading(false);
      }
    },
    [isReloading]
  );

  useEffect(() => {
    (async () => {
      try {
        await reload();
        const { data, error: e } = await sb().from('settings').select('*').eq('id', 1).maybeSingle();
        if (e) throw e;
        if (data) setSettings(data as Settings);
      } catch (e) {
        setError(e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)));
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const insert = useCallback(
    async <T,>(table: TableName, row: object) => {
      const { data, error: e } = await sb().from(table).insert(row).select().single();
      if (e) throw e;
      await reload(table);
      return data as T;
    },
    [reload]
  );

  const insertMany = useCallback(
    async (table: TableName, rows: object[]) => {
      let inserted = 0;
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const { error: e } = await sb()
            .from(table)
            .insert(rows.slice(i, i + 200));
          if (e) {
            const err = new Error(`Importación parcial: ${inserted}/${rows.length} registros importados`);
            (err as any).originalError = e;
            throw err;
          }
          inserted += Math.min(200, rows.length - i);
        }
      } finally {
        if (inserted > 0) await reload(table);
      }
    },
    [reload]
  );

  const update = useCallback(
    async (table: TableName, id: string, patch: object) => {
      const { error: e } = await sb().from(table).update(patch).eq('id', id);
      if (e) throw e;
      await reload(table);
    },
    [reload]
  );

  const remove = useCallback(
    async (table: TableName, id: string) => {
      const { error: e } = await sb().from(table).delete().eq('id', id);
      if (e) throw e;
      await reload(table);
    },
    [reload]
  );

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const { error: e } = await sb().from('settings').update(patch).eq('id', 1);
    if (e) throw e;
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...db, settings, loading, error, reload, insert, insertMany, update, remove, saveSettings }),
    [db, settings, loading, error, reload, insert, insertMany, update, remove, saveSettings]
  );
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
