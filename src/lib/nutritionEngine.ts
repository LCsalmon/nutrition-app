import { ActivityLevel, Gender, Goal, Profile } from '../types';

// 活动系数（基于常见营养学指南）
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // 几乎不运动
  light: 1.375, // 每周轻度运动1-3天
  moderate: 1.55, // 每周中度运动3-5天
  active: 1.725, // 每周高强度运动6-7天
  very_active: 1.9, // 体力劳动/每天高强度训练
};

function calculateAge(birthDate?: string): number {
  if (!birthDate) return 30; // 默认值，避免缺失数据时报错
  const birth = new Date(birthDate);
  const diffMs = Date.now() - birth.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
}

// Mifflin-St Jeor 公式计算基础代谢率(BMR)
function calculateBMR(
  gender: Gender,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}

interface PlanResult {
  daily_calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_split: Record<string, number>;
  explanation: string;
}

// 根据目标调整每日总热量相对于TDEE的比例，以及宏量营养素分配比例
const GOAL_CONFIG: Record<
  Goal,
  { calorieAdjust: number; proteinRatio: number; fatRatio: number; label: string }
> = {
  lose_weight: { calorieAdjust: -0.2, proteinRatio: 0.3, fatRatio: 0.25, label: '减脂' },
  gain_muscle: { calorieAdjust: 0.1, proteinRatio: 0.3, fatRatio: 0.25, label: '增肌' },
  maintain: { calorieAdjust: 0, proteinRatio: 0.2, fatRatio: 0.3, label: '维持体重' },
  blood_sugar_control: { calorieAdjust: -0.1, proteinRatio: 0.25, fatRatio: 0.3, label: '控糖' },
  pregnancy: { calorieAdjust: 0.1, proteinRatio: 0.2, fatRatio: 0.3, label: '孕期营养' },
  general_wellness: { calorieAdjust: 0, proteinRatio: 0.2, fatRatio: 0.3, label: '日常养生' },
};

/**
 * 根据用户基础信息生成初始营养方案
 * 遵循：BMR(Mifflin-St Jeor) -> TDEE(活动系数) -> 按目标调整热量 -> 按目标分配宏量营养素比例
 */
export function generateInitialPlan(profile: Profile): PlanResult {
  const gender = profile.gender ?? 'female';
  const weight = profile.weight_kg ?? 60;
  const height = profile.height_cm ?? 165;
  const age = calculateAge(profile.birth_date);
  const activity = profile.activity_level ?? 'light';
  const goal = profile.goal ?? 'general_wellness';

  const bmr = calculateBMR(gender, weight, height, age);
  const tdee = bmr * ACTIVITY_FACTORS[activity];

  const config = GOAL_CONFIG[goal];
  // 安全下限：任何情况下每日热量不低于 1200 kcal（女性）/ 1500 kcal（男性），避免生成不健康的极低热量方案
  const safeMin = gender === 'male' ? 1500 : 1200;
  const targetCalories = Math.max(Math.round(tdee * (1 + config.calorieAdjust)), safeMin);

  const proteinG = Math.round((targetCalories * config.proteinRatio) / 4);
  const fatG = Math.round((targetCalories * config.fatRatio) / 9);
  const carbsKcal = targetCalories - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(Math.round(carbsKcal / 4), 0);

  const explanation =
    `根据你的身高体重、年龄和活动水平，估算你的每日消耗（TDEE）约为 ${Math.round(tdee)} 千卡。` +
    `结合你的目标「${config.label}」，为你设定每日摄入目标为 ${targetCalories} 千卡` +
    `（蛋白质 ${proteinG}g / 碳水 ${carbsG}g / 脂肪 ${fatG}g）。` +
    `这个方案会根据你后续的打卡数据和体重变化趋势，每 1-2 周自动微调。`;

  return {
    daily_calories_kcal: targetCalories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    meal_split: { breakfast: 0.3, lunch: 0.4, dinner: 0.3 },
    explanation,
  };
}
