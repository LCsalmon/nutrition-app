-- ============================================================
-- Migration v2: 家庭成员支持 (幂等版本)
-- 可以安全地重复执行
-- ============================================================

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relation text,
  gender text check (gender in ('male', 'female')),
  birth_date date,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('lose_weight','gain_muscle','maintain','blood_sugar_control','pregnancy','general_wellness')),
  allergies text[],
  dietary_preference text,
  created_at timestamptz default now()
);

alter table public.family_members enable row level security;

drop policy if exists "用户可管理自己名下的家庭成员" on public.family_members;
create policy "用户可管理自己名下的家庭成员" on public.family_members
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table public.nutrition_plans add column if not exists family_member_id uuid references public.family_members(id) on delete cascade;
alter table public.food_logs add column if not exists family_member_id uuid references public.family_members(id) on delete cascade;
alter table public.body_metrics add column if not exists family_member_id uuid references public.family_members(id) on delete cascade;

drop index if exists one_active_plan_per_user;
drop index if exists one_active_plan_per_member;
create unique index one_active_plan_per_member
  on public.nutrition_plans (user_id, coalesce(family_member_id, '00000000-0000-0000-0000-000000000000'))
  where is_active = true;
