-- Defensa adicional: RLS no tiene DELETE, y tampoco se concede el privilegio.
revoke all on public.control_st7_acuses from anon;
revoke delete on public.control_st7_acuses from authenticated;
grant select, insert, update on public.control_st7_acuses to authenticated;

