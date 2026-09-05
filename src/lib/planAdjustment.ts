import { supabase } from './supabase';
import { NutritionPlan, Profile } from '../types';

const EVALUATION_INTERVAL_DAYS = 12; // 约1-2周评估一次
const LOOKBACK_DAYS = 14; // 评估时回看多少天的数据

const SAFE_MIN_CALORIES = { male: 1500, female: 1200 } as const;

function daysBetween(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

interface EvaluationResult {
  shouldAdjust: boolean;
  calorieDeltaRatio: number; // 相对于当前热量目标的调整比例，如 -0.05 表示减少5%
  reason: string;
}

function evaluate(
  profile: Profile,
  plan: NutritionPlan,
  loggedDaysCount: number,
  weightChangeKg: number | null
): EvaluationResult {
  const adherence = loggedDaysCount / LOOKBACK_DAYS;

  // 依从度太低：数据不足以支撑调整，维持原方案，鼓励用户多打卡
  if (adherence < 0.35) {
    return {
      shouldAdjust: false,
      calorieDeltaRatio: 0,
      reason: `过去${LOOKBACK_DAYS}天你只记录了${loggedDaysCount}天的饮食，数据还不够支撑我们做出准确调整。先维持当前方案，建议尽量坚持每天打卡，这样下一次评估才能更精准地帮你优化。`,
    };
  }

  const goal = profile.goal ?? 'general_wellness';

  // 没有体重数据时，只能基于依从度做保守判断
  if (weightChangeKg === null) {
    return {
      shouldAdjust: false,
      calorieDeltaRatio: 0,
      reason: '暂时没有足够的体重记录来判断方案是否需要调整，建议定期记录体重，以便我们更准确地追踪你的进展。',
    };
  }

  const weeklyChange = weightChangeKg / (LOOKBACK_DAYS / 7);

  switch (goal) {
    case 'lose_weight':
      if (weeklyChange > -0.2) {
        return {
          shouldAdjust: true,
          calorieDeltaRatio: -0.05,
          reason: `过去两周体重变化约为 ${weeklyChange.toFixed(1)}kg/周，低于理想的减重速度（约0.5kg/周）。已将每日热量目标下调 5%，帮助你更有效地减脂。`,
        };
      }
      if (weeklyChange < -1) {
        return {
          shouldAdjust: true,
          calorieDeltaRatio: 0.05,
          reason: `过去两周体重下降速度较快（约 ${Math.abs(weeklyChange).toFixed(1)}kg/周），为了避免过度节食影响健康和肌肉量，已将每日热量目标上调 5%。`,
        };
      }
      return {
        shouldAdjust: true,
        calorieDeltaRatio: 0,
        reason: `过去两周体重变化约为 ${weeklyChange.toFixed(1)}kg/周，处于健康的减重速度范围内，方案维持不变，继续保持！`,
      };

    case 'gain_muscle':
      if (weeklyChange < 0.1) {
        return {
          shouldAdjust: true,
          calorieDeltaRatio: 0.05,
          reason: `过去两周体重增长较慢（约 ${weeklyChange.toFixed(1)}kg/周），已将每日热量目标上调 5%，为增肌提供更充足的能量支持。`,
        };
      }
      if (weeklyChange > 0.6) {
        return {
          shouldAdjust: true,
          calorieDeltaRatio: -0.05,
          reason: `过去两周体重增长偏快（约 ${weeklyChange.toFixed(1)}kg/周），为避免脂肪增长过多，已将每日热量目标下调 5%。`,
        };
      }
      return {
        shouldAdjust: true,
        calorieDeltaRatio: 0,
        reason: `过去两周体重增长约 ${weeklyChange.toFixed(1)}kg/周，速度合理，方案维持不变。`,
      };

    default:
      // maintain / blood_sugar_control / pregnancy / general_wellness：以稳定为主，只做小幅纠偏
      if (Math.abs(weeklyChange) > 0.4) {
        const delta = weeklyChange > 0 ? -0.03 : 0.03;
        return {
          shouldAdjust: true,
          calorieDeltaRatio: delta,
          reason: `过去两周体重出现了 ${weeklyChange > 0 ? '上升' : '下降'}趋势（约 ${Math.abs(
            weeklyChange
          ).toFixed(1)}kg/周），已对每日热量目标做${delta > 0 ? '上' : '下'}调 ${Math.abs(
            delta * 100
          )}% 的小幅纠偏，帮助你维持稳定。`,
        };
      }
      return {
        shouldAdjust: true,
        calorieDeltaRatio: 0,
        reason: '体重保持稳定，当前方案继续维持。',
      };
  }
}

/**
 * 检查用户当前方案是否需要评估调整（每约12天检查一次）
 * 如果需要，会读取近14天的打卡与体重数据，生成新的方案版本（写入nutrition_plans，旧版本置为非active）
 * 返回最新的active方案；如果本次不需要评估，返回原方案
 */
export async function checkAndAdjustPlan(
  userId: string,
  profile: Profile,
  activePlan: NutritionPlan,
  force = false
): Promise<NutritionPlan> {
  const planAge = daysBetween(new Date(activePlan.created_at), new Date());
  if (!force && planAge < EVALUATION_INTERVAL_DAYS) {
    return activePlan; // 还没到评估周期
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: logs } = await supabase
    .from('food_logs')
    .select('log_date')
    .eq('user_id', userId)
    .gte('log_date', sinceStr);

  const loggedDaysCount = new Set((logs ?? []).map((l) => l.log_date)).size;

  const { data: metrics } = await supabase
    .from('body_metrics')
    .select('weight_kg, recorded_at')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: true });

  let weightChangeKg: number | null = null;
  if (metrics && metrics.length >= 2) {
    weightChangeKg = metrics[metrics.length - 1].weight_kg - metrics[0].weight_kg;
  }

  const result = evaluate(profile, activePlan, loggedDaysCount, weightChangeKg);

  const newCalories = Math.max(
    Math.round(activePlan.daily_calories_kcal * (1 + result.calorieDeltaRatio)),
    SAFE_MIN_CALORIES[profile.gender ?? 'female']
  );

  // 按原方案的宏量比例重新分配蛋白质/碳水/脂肪
  const scaleRatio = newCalories / activePlan.daily_calories_kcal;
  const newProtein = Math.round(activePlan.protein_g * scaleRatio);
  const newFat = Math.round(activePlan.fat_g * scaleRatio);
  const newCarbsKcal = newCalories - newProtein * 4 - newFat * 9;
  const newCarbs = Math.max(Math.round(newCarbsKcal / 4), 0);

  // 先把旧方案置为非active，再插入新方案（新方案的created_at会重置评估周期）
  await supabase
    .from('nutrition_plans')
    .update({ is_active: false })
    .eq('id', activePlan.id);

  const { data: newPlan, error } = await supabase
    .from('nutrition_plans')
    .insert({
      user_id: userId,
      daily_calories_kcal: newCalories,
      protein_g: newProtein,
      carbs_g: newCarbs,
      fat_g: newFat,
      meal_split: activePlan.meal_split,
      explanation: result.reason,
      is_active: true,
    })
    .select('*')
    .single();

  if (error || !newPlan) {
    console.warn('方案调整失败，保留原方案', error?.message);
    // 回滚：把旧方案重新设为active，避免用户没有任何生效方案
    await supabase.from('nutrition_plans').update({ is_active: true }).eq('id', activePlan.id);
    return activePlan;
  }

  return newPlan;
}
