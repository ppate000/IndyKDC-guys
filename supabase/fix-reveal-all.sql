-- Run this once in Supabase SQL Editor for an EXISTING leaderboard project.
create or replace function public.admin_reveal_all()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set revealed=true, updated_at=now() where id between 1 and 6;
  update public.leaderboard_settings set scores_hidden=false, updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_reveal_all() from public;
grant execute on function public.admin_reveal_all() to authenticated;
