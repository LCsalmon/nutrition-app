-- ============================================================
-- Migration v3: 已消耗卡路里字段 (幂等版本)
-- ============================================================

alter table public.body_metrics add column if not exists active_calories_kcal numeric(7,2);
