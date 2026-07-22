-- ============================================================
-- El Fogon de Lu - los cierres anteriores son solo del admin
-- Proyecto Supabase: isco-soda
--
-- El cobrador abre y cierra caja, pero no debe repasar los cierres de otros dias.
-- La policy original le dejaba leer toda sesion con business_date = hoy: aunque la
-- pantalla ya no le muestra el historial, por API podia sacar el cierre del dia.
--
-- Se reescribe p_sessions_read para que el cobrador solo alcance la caja ABIERTA
-- (que necesita para operar y cerrar). El resto de sus pantallas -Dashboard, caja,
-- creditos, gastos- ya leen cash_sessions solo con status = 'abierta', y el
-- resumen del dia sale de get_day_summary (security definer), asi que nada se rompe.
-- El admin sigue viendo todo por is_admin().
-- ============================================================

drop policy if exists p_sessions_read on public.cash_sessions;

create policy p_sessions_read on public.cash_sessions
  for select to authenticated using (
    (select public.is_admin())
    or status = 'abierta'
  );
