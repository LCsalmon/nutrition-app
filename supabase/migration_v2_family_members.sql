-- ============================================================
-- Migration v2: 家庭成员支持
-- 在 Supabase SQL Editor 中运行
-- ============================================================

-- 家庭成员表：一个账号(auth.users)可以管理多个家庭成员的档案
-- 家庭成员本身不需要单独登录账号，由 owner_id 对应的账号统一管理
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relation text,                    -- 例如：配偶/子女/父母/其他
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

create policy "用户可管理自己名下的家庭成员" on public.family_members
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 给方案/打卡/体重记录加上 family_member_id 字段
-- 为 null 表示这条记录属于账号本人；有值则属于对应的家庭成员
alter table public.nutrition_plans add column family_member_id uuid references public.family_members(id) on delete cascade;
alter table public.food_logs add column family_member_id uuid references public.family_members(id) on delete cascade;
alter table public.body_metrics add column family_member_id uuid references public.family_members(id) on delete cascade;

-- 重建"每人同一时间只有一个active方案"的唯一约束，把 family_member_id 也纳入判断
-- 用 coalesce 处理 null（代表本人），避免 Postgres 对 NULL 值不做唯一性检查的问题
drop index if exists one_active_plan_per_user;
create unique index one_active_plan_per_member
  on public.nutrition_plans (user_id, coalesce(family_member_id, '00000000-0000-0000-0000-000000000000'))
  where is_active = true;
