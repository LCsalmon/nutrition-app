// Supabase Edge Function: adjust-plan
// 作用：分析用户过去1-2周的打卡数据和体重趋势，自动微调营养方案
// 触发方式：pg_cron 定时调用（见 ../../schedule_adjust_plan.sql），或 App 内手动触发测试
// 部署命令：supabase functions deploy adjust-plan

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const MIN_DAYS_BETWEEN_ADJUSTMENTS = 12; // 至少间隔12天才自动调整一次（约1-2周）
const LOOKBACK_DAYS = 14;

// 与 App 端 nutritionEngine.ts 保持一致的目标配置
const GOAL_CONFIG: Record<string, { proteinRatio: number; fatRatio: number; label: string }> = {
  lose_weight: { proteinRatio: 0.3, fatRatio: 0.25, label: '减脂' },
  gain_muscle: { proteinRatio: 0.3, fatRatio: 0.25, label: '增肌' },
  maintain: { proteinRatio: 0.2, fatRatio: 0.3, label: '维持体重' },
  blood_sugar_control: { proteinRatio: 0.25, fatRatio: 0.3, label: '控糖' },
  pregnancy: { proteinRatio: 0.2, fatRatio: 0.3, label: '孕期营养' },
  general_wellness: { proteinRatio: 0.2, fatRatio: 0.3, label: '日常养生' },
};

function safeMinCalories(gender: string | undefined) {
  return gender === 'male' ? 1500 : 1200;
}

function recomputeMacros(calories: number, goal: string) {
  const config = GOAL_CONFIG[goal] ?? GOAL_CONFIG.general_wellness;
  const proteinG = Math.round((calories * config.proteinRatio) / 4);
  const fatG = Math.round((calories * config.fatRatio) / 9);
  const carbsG = Math.max(Math.round((calories - proteinG * 4 - fatG * 9) / 4), 0);
  return { proteinG, fatG, carbsG };
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const manualUserId: string | undefined = body?.user_id;
    const manualOverride: boolean = !!body?.manual;

    // 1. 找出需要评估的用户：手动指定的用户，或所有 active 方案已运行超过 MIN_DAYS_BETWEEN_ADJUSTMENTS 天的用户
    let plansQuery = supabase.from('nutrition_plans').select('*').eq('is_active', true);
    if (manualUserId) {
      plansQuery = plansQuery.eq('user_id', manualUserId);
    }
    const { data: activePlans, error: plansError } = await plansQuery;
    if (plansError) throw plansError;

    const results: any[] = [];

    for (const plan of activePlans ?? []) {
      const planAgeDays =
        (Date.now() - new Date(plan.created_at).getTime()) / (1000 * 60 * 60 * 24);

      if (!manualOverride && planAgeDays < MIN_DAYS_BETWEEN_ADJUSTMENTS) {
        continue; // 还没到评估周期，跳过
      }

      // 2. 拉取该用户的资料
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', plan.user_id)
        .single();
      if (!profile) continue;

      // 3. 拉取过去 LOOKBACK_DAYS 天的打卡记录
      const sinceDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { data: logs } = await supabase
        .from('food_logs')
        .select('log_date, calories_kcal')
        .eq('user_id', plan.user_id)
        .gte('log_date', sinceDate);

      const loggedDays = new Set((logs ?? []).map((l) => l.log_date));
      const adherence = loggedDays.size / LOOKBACK_DAYS; // 打卡覆盖率
      const totalCalories = (logs ?? []).reduce((sum, l) => sum + (l.calories_kcal || 0), 0);
      const avgDailyCalories = loggedDays.size > 0 ? totalCalories / loggedDays.size : 0;

      // 4. 拉取体重趋势（该周期开始和最近的体重记录）
      const { data: metrics } = await supabase
        .from('body_metrics')
        .select('weight_kg, recorded_at')
        .eq('user_id', plan.user_id)
        .gte('recorded_at', sinceDate)
        .order('recorded_at', { ascending: true });

      let weightChangePerWeek = 0;
      if (metrics && metrics.length >= 2) {
        const first = metrics[0];
        const last = metrics[metrics.length - 1];
        const daysBetween =
          (new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysBetween > 0 && first.weight_kg && last.weight_kg) {
          weightChangePerWeek =
            ((last.weight_kg - first.weight_kg) / daysBetween) * 7;
        }
      }

      // 5. 调整逻辑
      let newCalories = plan.daily_calories_kcal;
      let reason = '';

      if (adherence < 0.4) {
        // 打卡覆盖率太低，数据不足以判断，不调整热量目标，只给出行为提醒
        reason = `过去两周你只记录了 ${loggedDays.size} 天的饮食（覆盖率较低），暂时保持原方案不变。建议坚持每天打卡，这样系统才能更准确地帮你调整。`;
      } else {
        const goal = profile.goal ?? 'general_wellness';
        if (goal === 'lose_weight') {
          if (weightChangePerWeek > -0.2) {
            // 减脂目标但体重几乎没降 -> 小幅下调热量
            newCalories = Math.round(plan.daily_calories_kcal * 0.93);
            reason = `过去两周你的体重变化约为每周 ${weightChangePerWeek.toFixed(1)}kg，减重速度偏慢，为你小幅下调每日热量目标。`;
          } else if (weightChangePerWeek < -1) {
            // 掉太快，回调
            newCalories = Math.round(plan.daily_calories_kcal * 1.05);
            reason = `过去两周你的体重下降速度偏快（约每周 ${Math.abs(weightChangePerWeek).toFixed(1)}kg），为了健康可持续，为你适度上调热量目标。`;
          } else {
            reason = `过去两周体重变化趋势健康（约每周 ${weightChangePerWeek.toFixed(1)}kg），当前方案维持不变，继续保持。`;
          }
        } else if (goal === 'gain_muscle') {
          if (weightChangePerWeek < 0.15) {
            newCalories = Math.round(plan.daily_calories_kcal * 1.06);
            reason = `过去两周体重增长偏慢，为你小幅上调热量以支持增肌目标。`;
          } else if (weightChangePerWeek > 0.8) {
            newCalories = Math.round(plan.daily_calories_kcal * 0.96);
            reason = `过去两周体重增长偏快，为避免脂肪增加过多，小幅下调热量。`;
          } else {
            reason = `增肌进度理想（约每周 +${weightChangePerWeek.toFixed(1)}kg），方案维持不变。`;
          }
        } else {
          // 维持/控糖/孕期/日常养生：目标是体重基本稳定
          if (Math.abs(weightChangePerWeek) > 0.4) {
            const direction = weightChangePerWeek > 0 ? -0.05 : 0.05;
            newCalories = Math.round(plan.daily_calories_kcal * (1 + direction));
            reason = `过去两周体重出现${weightChangePerWeek > 0 ? '上升' : '下降'}趋势，为你微调热量目标以帮助稳定。`;
          } else {
            reason = `体重趋势稳定，方案维持不变。`;
          }
        }
      }

      newCalories = Math.max(newCalories, safeMinCalories(profile.gender));
      const { proteinG, fatG, carbsG } = recomputeMacros(newCalories, profile.goal ?? 'general_wellness');

      const hasChanged = newCalories !== plan.daily_calories_kcal;

      if (hasChanged) {
        // 停用旧方案，插入新方案
        await supabase
          .from('nutrition_plans')
          .update({ is_active: false })
          .eq('id', plan.id);

        await supabase.from('nutrition_plans').insert({
          user_id: plan.user_id,
          daily_calories_kcal: newCalories,
          protein_g: proteinG,
          carbs_g: carbsG,
          fat_g: fatG,
          meal_split: plan.meal_split,
          explanation: reason,
          is_active: true,
        });
      }

      results.push({
        user_id: plan.user_id,
        adherence,
        avgDailyCalories,
        weightChangePerWeek,
        adjusted: hasChanged,
        newCalories,
        reason,
      });
    }

    return new Response(JSON.stringify({ success: true, evaluated: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
