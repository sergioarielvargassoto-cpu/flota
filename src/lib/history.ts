import { sb } from './supabase';

/** Registra un cambio de kilómetros en el historial */
export async function recordKmChange(vehicleId: string, km: number) {
  const { error } = await sb().from('km_history').insert({ vehicle_id: vehicleId, km, recorded_at: new Date().toISOString() });
  if (error) throw error;
}

/** Registra un cambio en una reparación */
export async function recordRepairChange(repairId: string, field: string, oldValue: string | null, newValue: string) {
  const { error } = await sb().from('repair_history').insert({
    repair_id: repairId,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Registra un cambio en un mantenimiento */
export async function recordMaintenanceChange(maintenanceId: string, field: string, oldValue: string | null, newValue: string) {
  const { error } = await sb().from('maintenance_history').insert({
    maintenance_id: maintenanceId,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: new Date().toISOString(),
  });
  if (error) throw error;
}
