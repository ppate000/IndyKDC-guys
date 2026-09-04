-- ============================================================
-- RUN THIS ONLY AFTER creating the Auth users in Supabase.
-- Replace the example emails first.
-- ============================================================

-- Admin (one account)
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where lower(email)=lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do update set role=excluded.role;

-- Points Masters: duplicate this block for as many accounts as you want.
insert into public.user_roles (user_id, role)
select id, 'points_master' from auth.users where lower(email)=lower('POINTS_MASTER_1@example.com')
on conflict (user_id) do update set role=excluded.role;

insert into public.user_roles (user_id, role)
select id, 'points_master' from auth.users where lower(email)=lower('POINTS_MASTER_2@example.com')
on conflict (user_id) do update set role=excluded.role;

-- Verify roles:
select u.email, r.role
from public.user_roles r
join auth.users u on u.id=r.user_id
order by r.role, u.email;
