-- ============================================================
-- Migration v4: 体检报告识别结果 (幂等版本)
-- 注意：不存储原始报告图片，只存储提取出的结构化指标和分级结果
-- ============================================================

create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references public.family_members(id) on delete cascade,
  indicators jsonb not null,
  overall_risk text check (overall_risk in ('normal','mild','high')),
  created_at timestamptz default now()
);

alter table public.health_reports enable row level security;

drop policy if exists "用户可读写自己的体检报告记录" on public.health_reports;
create policy "用户可读写自己的体检报告记录" on public.health_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
