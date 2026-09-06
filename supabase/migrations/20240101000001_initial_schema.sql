-- ============================================================
-- 精准营养管理平台 - 初始数据库 Schema (幂等版本)
-- 这个文件可以安全地重复执行：已存在的表/函数/策略不会报错
-- ============================================================

-- ---------- 1. 用户扩展资料表 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  gender text check (gender in ('male', 'female')),
  birth_date date,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('lose_weight','gain_muscle','maintain','blood_sugar_control','pregnancy','general_wellness')),
  allergies text[],
  dietary_preference text,
  cooking_time_per_day text,
  eating_out_frequency text,
  region text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 2. 营养方案表 ----------
create table if not exists public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_calories_kcal integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  meal_split jsonb,
  explanation text,
  is_active boolean default true,
  created_at timestamptz default now()
);

drop index if exists one_active_plan_per_user;
create unique index if not exists one_active_plan_per_user
  on public.nutrition_plans (user_id)
  where is_active = true;

-- ---------- 3. 食物数据库 ----------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  calories_kcal_per_100g numeric(6,2) not null,
  protein_g_per_100g numeric(6,2) default 0,
  carbs_g_per_100g numeric(6,2) default 0,
  fat_g_per_100g numeric(6,2) default 0,
  fiber_g_per_100g numeric(6,2) default 0,
  common_portion_g numeric(6,2),
  common_portion_name text,
  source text default 'system',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- 4. 每日饮食打卡记录 ----------
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id),
  custom_food_name text,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')),
  amount_g numeric(6,2) not null,
  calories_kcal numeric(7,2) not null,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  logged_at timestamptz default now(),
  log_date date default (now() at time zone 'utc')::date
);

-- ---------- 5. 体重/身体数据趋势记录 ----------
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,1),
  body_fat_pct numeric(4,1),
  steps integer,
  source text default 'manual',
  recorded_at timestamptz default now()
);

-- ============================================================
-- 行级安全策略 (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.food_logs enable row level security;
alter table public.body_metrics enable row level security;
alter table public.foods enable row level security;

drop policy if exists "用户可读写自己的资料" on public.profiles;
create policy "用户可读写自己的资料" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "用户可读写自己的方案" on public.nutrition_plans;
create policy "用户可读写自己的方案" on public.nutrition_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "用户可读写自己的打卡记录" on public.food_logs;
create policy "用户可读写自己的打卡记录" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "用户可读写自己的身体数据" on public.body_metrics;
create policy "用户可读写自己的身体数据" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "所有登录用户可读食物库" on public.foods;
create policy "所有登录用户可读食物库" on public.foods
  for select using (auth.role() = 'authenticated');

drop policy if exists "用户可新增自定义食物" on public.foods;
create policy "用户可新增自定义食物" on public.foods
  for insert with check (auth.uid() = created_by);

-- ============================================================
-- 触发器：新用户注册后自动创建 profiles 空记录
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 预置常见本地化食物数据（只在表为空时插入一次，避免重复执行导致重复数据）
-- ============================================================
do $$
begin
  if not exists (select 1 from public.foods limit 1) then
    insert into public.foods (name, category, calories_kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g, common_portion_g, common_portion_name) values
    ('白米饭', '主食', 116, 2.6, 25.9, 0.3, 0.3, 150, '一碗'),
    ('鸡胸肉', '肉类', 133, 24.6, 0, 5, 0, 100, '一份'),
    ('鸡蛋', '蛋类', 144, 13.3, 2.8, 8.8, 0, 50, '一个'),
    ('西兰花', '蔬菜', 34, 2.8, 4.3, 0.4, 2.6, 100, '一份'),
    ('香蕉', '水果', 93, 1.4, 22, 0.2, 1.6, 120, '一根'),
    ('三文鱼', '海鲜', 139, 22.3, 0, 6.3, 0, 100, '一份'),
    ('燕麦片', '主食', 367, 15, 61, 7, 10.6, 40, '一份'),
    ('牛奶', '饮品', 54, 3, 3.4, 3.6, 0, 250, '一杯');
  end if;
end $$;
