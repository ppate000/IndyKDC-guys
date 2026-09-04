-- ============================================================
-- KDC SPACE LEADERBOARD — ONE-TIME SUPABASE DATABASE SETUP
-- ============================================================
-- Run this entire file in Supabase Dashboard -> SQL Editor.
-- It is designed to be safe to rerun while you are setting up.
-- IMPORTANT: this script creates/updates schema and starting rows.
-- It does NOT create Auth users; create those in Authentication -> Users.

begin;

create table if not exists public.teams (
  id smallint primary key,
  name text not null check (char_length(name) between 1 and 30),
  score integer not null default 0 check (score >= 0),
  display_order smallint not null unique,
  revealed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.surge_rooms (
  id smallint primary key,
  name text not null check (char_length(name) between 1 and 30),
  updated_at timestamptz not null default now()
);

create table if not exists public.leaderboard_settings (
  id smallint primary key default 1 check (id = 1),
  current_half smallint not null default 1 check (current_half in (1,2)),
  scores_hidden boolean not null default false,
  timer_visible boolean not null default false,
  timer_ends_at timestamptz,
  point_surge_active boolean not null default false,
  active_surge_room_id smallint references public.surge_rooms(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','points_master')),
  created_at timestamptz not null default now()
);

insert into public.teams (id,name,score,display_order,revealed) values
  (1,'Team 1',0,1,false),(2,'Team 2',0,2,false),(3,'Team 3',0,3,false),
  (4,'Team 4',0,4,false),(5,'Team 5',0,5,false),(6,'Team 6',0,6,false)
on conflict (id) do nothing;

insert into public.surge_rooms (id,name) values
  (1,'Room 1'),(2,'Room 2'),(3,'Room 3')
on conflict (id) do nothing;

insert into public.leaderboard_settings (id) values (1)
on conflict (id) do nothing;

alter table public.teams enable row level security;
alter table public.surge_rooms enable row level security;
alter table public.leaderboard_settings enable row level security;
alter table public.user_roles enable row level security;

-- Public viewers can read only presentation data.
drop policy if exists "Public can read teams" on public.teams;
create policy "Public can read teams" on public.teams for select to anon, authenticated using (true);
drop policy if exists "Public can read settings" on public.leaderboard_settings;
create policy "Public can read settings" on public.leaderboard_settings for select to anon, authenticated using (true);
drop policy if exists "Public can read surge rooms" on public.surge_rooms;
create policy "Public can read surge rooms" on public.surge_rooms for select to anon, authenticated using (true);

-- Nobody gets direct writes from browser table APIs. Mutations happen only through RPCs below.
revoke all on public.teams from anon, authenticated;
revoke all on public.leaderboard_settings from anon, authenticated;
revoke all on public.surge_rooms from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.leaderboard_settings to anon, authenticated;
grant select on public.surge_rooms to anon, authenticated;

-- Helper: current signed-in user's role. SECURITY DEFINER lets it read user_roles.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

create or replace function public.require_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin permission required';
  end if;
end;
$$;
revoke all on function public.require_admin() from public;

create or replace function public.require_score_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','points_master')
  ) then
    raise exception 'Points Master permission required';
  end if;
end;
$$;
revoke all on function public.require_score_role() from public;

create or replace function public.adjust_team_score(p_team_id smallint, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare new_score integer;
begin
  perform public.require_score_role();
  if p_delta not in (-5,-1,1,5,10,15) then raise exception 'Invalid score increment'; end if;
  update public.teams
     set score = greatest(0, score + p_delta), updated_at = now()
   where id = p_team_id
   returning score into new_score;
  if new_score is null then raise exception 'Team not found'; end if;
  return new_score;
end;
$$;
revoke all on function public.adjust_team_score(smallint,integer) from public;
grant execute on function public.adjust_team_score(smallint,integer) to authenticated;

create or replace function public.admin_set_half(p_half smallint)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  if p_half not in (1,2) then raise exception 'Half must be 1 or 2'; end if;
  update public.leaderboard_settings set current_half=p_half, updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_set_half(smallint) from public;
grant execute on function public.admin_set_half(smallint) to authenticated;

create or replace function public.admin_start_timer(p_seconds integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  if p_seconds < 1 or p_seconds > 86400 then raise exception 'Timer must be 1 to 86400 seconds'; end if;
  update public.leaderboard_settings set timer_visible=true, timer_ends_at=now()+make_interval(secs=>p_seconds), updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_start_timer(integer) from public;
grant execute on function public.admin_start_timer(integer) to authenticated;

create or replace function public.admin_clear_timer()
returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_admin(); update public.leaderboard_settings set timer_visible=false,timer_ends_at=null,updated_at=now() where id=1; end; $$;
revoke all on function public.admin_clear_timer() from public;
grant execute on function public.admin_clear_timer() to authenticated;

create or replace function public.admin_hide_scores()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set revealed=false, updated_at=now();
  update public.leaderboard_settings set scores_hidden=true, updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_hide_scores() from public;
grant execute on function public.admin_hide_scores() to authenticated;

create or replace function public.admin_reveal_team(p_team_id smallint)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set revealed=true, updated_at=now() where id=p_team_id;
  if not found then raise exception 'Team not found'; end if;
end; $$;
revoke all on function public.admin_reveal_team(smallint) from public;
grant execute on function public.admin_reveal_team(smallint) to authenticated;

create or replace function public.admin_reveal_all()
returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_admin(); update public.teams set revealed=true,updated_at=now(); end; $$;
revoke all on function public.admin_reveal_all() from public;
grant execute on function public.admin_reveal_all() to authenticated;

create or replace function public.admin_start_point_surge(p_room_id smallint)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  if not exists(select 1 from public.surge_rooms where id=p_room_id) then raise exception 'Room not found'; end if;
  update public.leaderboard_settings set point_surge_active=true,active_surge_room_id=p_room_id,updated_at=now() where id=1;
end; $$;
revoke all on function public.admin_start_point_surge(smallint) from public;
grant execute on function public.admin_start_point_surge(smallint) to authenticated;

create or replace function public.admin_clear_point_surge()
returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_admin(); update public.leaderboard_settings set point_surge_active=false,active_surge_room_id=null,updated_at=now() where id=1; end; $$;
revoke all on function public.admin_clear_point_surge() from public;
grant execute on function public.admin_clear_point_surge() to authenticated;

create or replace function public.admin_rename_team(p_team_id smallint,p_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  p_name:=btrim(p_name);
  if char_length(p_name)<1 or char_length(p_name)>30 then raise exception 'Team name must be 1-30 characters'; end if;
  update public.teams set name=p_name,updated_at=now() where id=p_team_id;
  if not found then raise exception 'Team not found'; end if;
end; $$;
revoke all on function public.admin_rename_team(smallint,text) from public;
grant execute on function public.admin_rename_team(smallint,text) to authenticated;

create or replace function public.admin_rename_room(p_room_id smallint,p_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  p_name:=btrim(p_name);
  if char_length(p_name)<1 or char_length(p_name)>30 then raise exception 'Room name must be 1-30 characters'; end if;
  update public.surge_rooms set name=p_name,updated_at=now() where id=p_room_id;
  if not found then raise exception 'Room not found'; end if;
end; $$;
revoke all on function public.admin_rename_room(smallint,text) from public;
grant execute on function public.admin_rename_room(smallint,text) to authenticated;

create or replace function public.admin_reset_leaderboard()
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.require_admin();
  update public.teams set score=0,revealed=false,updated_at=now();
  update public.leaderboard_settings
     set current_half=1,scores_hidden=false,timer_visible=false,timer_ends_at=null,
         point_surge_active=false,active_surge_room_id=null,updated_at=now()
   where id=1;
end; $$;
revoke all on function public.admin_reset_leaderboard() from public;
grant execute on function public.admin_reset_leaderboard() to authenticated;

alter table public.teams replica identity full;
alter table public.leaderboard_settings replica identity full;
alter table public.surge_rooms replica identity full;

-- Add tables to the Realtime publication only when they are not already present.
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='teams') then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leaderboard_settings') then
    alter publication supabase_realtime add table public.leaderboard_settings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='surge_rooms') then
    alter publication supabase_realtime add table public.surge_rooms;
  end if;
end $$;

commit;
