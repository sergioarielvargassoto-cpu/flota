export type VehicleType = 'Camión' | 'Utilitario' | 'Camioneta' | 'Furgón' | 'Acoplado' | 'Auto' | 'Moto';
export type VehicleStatus = 'Activo' | 'En taller' | 'Baja';
export type DocType = 'Licencia' | 'VTV' | 'Seguro' | 'Verificación' | 'Registración' | 'RTO' | 'Otro';

export type Vehicle = {
  id: string; plate: string; type: VehicleType | null; brand: string | null; model: string | null;
  year: number | null; km: number | null; km_date: string | null; last_service_km: number | null;
  fuel_card: string | null; driver_id: string | null; status: VehicleStatus;
  chassis: string | null; notes: string | null; branch: string; provincia: string | null; exclude_from_reports: boolean;
};
export type Driver = { id: string; name: string; dni: string | null; phone: string | null; notes: string | null };
export type Doc = {
  id: string; vehicle_id: string | null; driver_id: string | null; doc_type: DocType;
  expires_on: string | null; reference: string | null; notes: string | null;
};
export type Workshop = { id: string; name: string; phone: string | null; specialty: string | null; address: string | null; notes: string | null };
export type Repair = {
  id: string; vehicle_id: string; date: string; description: string; workshop_id: string | null;
  km: number | null; cost: number | null; invoice: string | null; status: 'Pendiente' | 'En curso' | 'Finalizada';
};
export type Maint = {
  id: string; vehicle_id: string; type: string; date: string; km: number | null; workshop_id: string | null;
  cost: number | null; next_date: string | null; next_km: number | null; notes: string | null;
};
export type Fuel = {
  id: string; vehicle_id: string; date: string; liters: number; amount: number | null; km: number | null;
  km_raw: number | null; station: string | null; product: string | null; driver_name: string | null; receipt: string | null;
};
export type Trip = {
  id: string; vehicle_id: string; date: string; km_calc: number; km_reported: number | null;
  max_speed: number | null; moving_time: string | null;
};
export type Attachment = {
  id: string; document_id: string | null; repair_id: string | null; maintenance_id: string | null; infraction_id: string | null; path: string; name: string;
};
export type Infraction = {
  id: string; driver_id: string; vehicle_id: string; date: string; type: string;
  description: string | null; location: string | null; infraction_number: string | null;
  fine_amount: number | null; status: 'Registrada' | 'Pagada' | 'Anulada'; notes: string | null;
};
export type Fine = {
  id: string; infraction_id: string; amount: number; paid_amount: number | null;
  paid_date: string | null; due_date: string | null; payment_method: string | null;
  receipt: string | null; notes: string | null;
};
export type KmReport = {
  id: string; vehicle_id: string; month: number; year: number; km_total: number;
  km_previous: number | null; km_by_day: Record<string, number> | null;
  branch: string | null; imported_at: string; imported_from: string | null;
};
export type KmHistory = {
  id: string; vehicle_id: string; km: number; km_previous: number | null; recorded_at: string; changed_by: string; created_at: string;
};
export type RepairHistory = {
  id: string; repair_id: string; field: string; old_value: string | null; new_value: string; changed_at: string; created_at: string;
};
export type MaintenanceHistory = {
  id: string; maintenance_id: string; field: string; old_value: string | null; new_value: string; changed_at: string; created_at: string;
};
export type Settings = { id: number; company: string; d1: number; d2: number; d3: number; km_alert: number; service_km: number };

export type TableName =
  | 'vehicles' | 'drivers' | 'documents' | 'workshops' | 'repairs'
  | 'maintenance' | 'fuel_loads' | 'trips' | 'attachments' | 'infractions' | 'fines' | 'km_reports'
  | 'km_history' | 'repair_history' | 'maintenance_history';

export type Status = 'vencido' | 'critico' | 'urgente' | 'proximo' | 'ok' | 'nd';
