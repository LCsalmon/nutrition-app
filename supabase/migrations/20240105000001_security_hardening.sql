-- ============================================================
-- Migration v5: 安全加固 (幂等版本)
-- 修复 Supabase 安全建议：函数 search_path 可变、SECURITY DEFINER 函数被匿名/登录用户可直接调用
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;
