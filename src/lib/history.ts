import { sb } from './supabase';

/** Registra un cambio de kilómetros en el historial con auditoría completa */
export async function recordKmChange(vehicleId: string, km: number, kmPrevious: number | null = null) {
  const { data: { user } } = await sb().auth.getUser();
  const changedBy = user?.email || 'sistema';

  const { error } = await sb().from('km_history').insert({
    vehicle_id: vehicleId,
    km,
    km_previous: kmPrevious,
    recorded_at: new Date().toISOString(),
    changed_by: changedBy,
  });
  if (error) throw error;
}

/** Registra un cambio en una reparación */
export async function recordRepairChange(repairId: string, field: string, oldValue: string | null, newValue: string) {
  const now = new Date().toISOString();
  const { error } = await sb().from('repair_history').insert({
    repair_id: repairId,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: now,
    created_at: now,
  });
  if (error) throw error;
}

/** Registra un cambio en un mantenimiento */
export async function recordMaintenanceChange(maintenanceId: string, field: string, oldValue: string | null, newValue: string) {
  const now = new Date().toISOString();
  const { error } = await sb().from('maintenance_history').insert({
    maintenance_id: maintenanceId,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: now,
    created_at: now,
  });
  if (error) throw error;
}
