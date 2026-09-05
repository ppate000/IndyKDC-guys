-- Run this once in Supabase SQL Editor on an existing KDC Leaderboard project.
-- It replaces the two functions that can trigger "UPDATE requires a WHERE clause".

create or replace function public.admin_hide_scores()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set revealed=false, updated_at=now() where id between 1 and 6;
  update public.leaderboard_settings set scores_hidden=true, updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_hide_scores() from public;
grant execute on function public.admin_hide_scores() to authenticated;

create or replace function public.admin_reset_leaderboard()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set score=0,revealed=false,updated_at=now() where id between 1 and 6;
  update public.leaderboard_settings
     set current_half=1,scores_hidden=false,timer_visible=false,timer_ends_at=null,
         point_surge_active=false,active_surge_room_id=null,updated_at=now()
   where id=1;
end; $$;
revoke all on function public.admin_reset_leaderboard() from public;
grant execute on function public.admin_reset_leaderboard() to authenticated;
