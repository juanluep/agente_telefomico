-- ════════════════════════════════════════════════════════════════════
-- 0004_booking_mode.sql — reservas por días (hoteles, etc.) o por horas
-- ════════════════════════════════════════════════════════════════════
-- La app nació para talleres (citas por franjas horarias). Este esquema
-- habilita negocios que reservan por DÍAS completos (hoteles, alquileres,
-- casas rurales…): cada servicio puede tener una estancia en días
-- (duration_days, p.ej. "habitación doble · 1 noche") y el negocio elige el
-- modo de reserva en voice_agents.booking_mode:
--   - 'horas' (default): comportamiento actual, franjas por minutos.
--   - 'dias': la cita ocupa días completos [inicio, inicio+duration_days).
--
-- En modo 'dias' el horario semanal sigue marcando qué días de la semana
-- están abiertos (is_closed), y los cierres y la capacidad aplican igual:
-- la capacidad es el número de reservas simultáneas (habitaciones) por día.
ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'horas'
    CHECK (booking_mode IN ('horas', 'dias'));

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS duration_days integer
    CHECK (duration_days IS NULL OR duration_days >= 1);