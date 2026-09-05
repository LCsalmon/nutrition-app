-- ============================================================
-- 精准营养管理平台 - 数据库 Schema (MVP v1)
-- 范围：用户资料 + 个性化方案生成 + 每日饮食打卡
-- 在 Supabase 项目的 SQL Editor 中直接粘贴运行即可
-- ============================================================

-- ---------- 1. 用户扩展资料表 ----------
-- Supabase 自带 auth.users 表管理账号/密码，这里存业务相关的资料
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  gender text check (gender in ('male', 'female')),
  birth_date date,
  height_cm numeric(5,1),         -- 身高 cm
  weight_kg numeric(5,1),         -- 当前体重 kg
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text check (goal in ('lose_weight','gain_muscle','maintain','blood_sugar_control','pregnancy','general_wellness')),
  allergies text[],               -- 过敏原列表
  dietary_preference text,        -- 饮食偏好，如 素食/清真/无特殊
  cooking_time_per_day text,      -- 每日做饭时间：none / <30min / 30-60min / >60min
  eating_out_frequency text,      -- 外食频率：rarely / sometimes / often / mostly
  region text,                    -- 地域饮食习惯，如 华南 / 华北 / 西南 等
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 2. 营养方案表 ----------
-- 每次系统生成/调整方案都会新增一条记录，保留历史，便于追踪"动态调整"逻辑
create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_calories_kcal integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  meal_split jsonb,                 -- 例如 {"breakfast":0.3,"lunch":0.4,"dinner":0.3}
  explanation text,                 -- 给用户看的“为什么这样调”的说明
  is_active boolean default true,   -- 当前生效的方案
  created_at timestamptz default now()
);

-- 保证同一用户同一时间只有一个 active 方案
create unique index one_active_plan_per_user
  on public.nutrition_plans (user_id)
  where is_active = true;

-- ---------- 3. 食物数据库（本地化，可扩展） ----------
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,                    -- 主食/肉类/蔬菜/水果/饮品/包装食品...
  calories_kcal_per_100g numeric(6,2) not null,
  protein_g_per_100g numeric(6,2) default 0,
  carbs_g_per_100g numeric(6,2) default 0,
  fat_g_per_100g numeric(6,2) default 0,
  fiber_g_per_100g numeric(6,2) default 0,
  common_portion_g numeric(6,2),     -- 常见一份的克数，便于快速记录
  common_portion_name text,          -- 例如 "一碗"、"一个"
  source text default 'system',      -- system(系统内置) / user(用户自建)
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- 4. 每日饮食打卡记录 ----------
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id),
  custom_food_name text,             -- 如果是拍照/未匹配到数据库食物时的临时名称
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')),
  amount_g numeric(6,2) not null,
  calories_kcal numeric(7,2) not null,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  logged_at timestamptz default now(),
  log_date date default (now() at time zone 'utc')::date  -- 便于按天聚合查询
);

-- ---------- 5. 体重/身体数据趋势记录（为后续可穿戴设备接入预留） ----------
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,1),
  body_fat_pct numeric(4,1),
  steps integer,
  source text default 'manual',      -- manual / apple_health / google_fit / device
  recorded_at timestamptz default now()
);

-- ============================================================
-- 行级安全策略 (RLS) —— 确保用户只能读写自己的数据
-- ============================================================
alter table public.profiles enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.food_logs enable row level security;
alter table public.body_metrics enable row level security;
alter table public.foods enable row level security;

create policy "用户可读写自己的资料" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "用户可读写自己的方案" on public.nutrition_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "用户可读写自己的打卡记录" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "用户可读写自己的身体数据" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 食物库：所有登录用户都可读；只能新增自己创建的自定义食物
create policy "所有登录用户可读食物库" on public.foods
  for select using (auth.role() = 'authenticated');

create policy "用户可新增自定义食物" on public.foods
  for insert with check (auth.uid() = created_by);

-- ============================================================
-- 触发器：新用户注册后自动创建 profiles 空记录
-- ============================================================
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 预置一批常见本地化食物数据（示例，可后续扩充）
-- ============================================================
insert into public.foods (name, category, calories_kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fiber_g_per_100g, common_portion_g, common_portion_name) values
('白米饭', '主食', 116, 2.6, 25.9, 0.3, 0.3, 150, '一碗'),
('鸡胸肉', '肉类', 133, 24.6, 0, 5, 0, 100, '一份'),
('鸡蛋', '蛋类', 144, 13.3, 2.8, 8.8, 0, 50, '一个'),
('西兰花', '蔬菜', 34, 2.8, 4.3, 0.4, 2.6, 100, '一份'),
('香蕉', '水果', 93, 1.4, 22, 0.2, 1.6, 120, '一根'),
('三文鱼', '海鲜', 139, 22.3, 0, 6.3, 0, 100, '一份'),
('燕麦片', '主食', 367, 15, 61, 7, 10.6, 40, '一份'),
('牛奶', '饮品', 54, 3, 3.4, 3.6, 0, 250, '一杯');
