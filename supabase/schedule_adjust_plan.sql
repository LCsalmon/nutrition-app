-- ============================================================
-- 配置定时任务：每天自动调用 adjust-plan 云函数
-- 函数内部会自己判断每个用户的方案是否已经运行满 12 天以上，
-- 满足条件才会真正调整，所以每天调用是安全的（不会调整过于频繁）
-- ============================================================

-- 1. 开启需要的扩展（Supabase 项目默认已支持，直接开启即可）
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2. 创建定时任务：每天凌晨2点（UTC时间）调用一次 adjust-plan 函数
--    请将下面两处替换为你自己的信息：
--    <YOUR_PROJECT_REF>       -> 你的 Supabase 项目 ref（从 Project URL 中获取，
--                                 例如 https://xeywoteopdaphartilke.supabase.co
--                                 那么 ref 就是 xeywoteopdaphartilke）
--    <YOUR_SERVICE_ROLE_KEY>  -> Settings -> API -> service_role key（注意不是 anon key！
--                                 这个 key 权限很高，只能放在这里，不要放到 App 代码里）

select cron.schedule(
  'daily-adjust-plan',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/adjust-plan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 如果以后想取消这个定时任务，执行：
-- select cron.unschedule('daily-adjust-plan');
