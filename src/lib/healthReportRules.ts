// ============================================================
// 体检报告指标 —— 参考范围与风险分级
// ============================================================
// 这里使用的数值范围是各大体检报告上普遍印着的通用临床参考范围
// （非本产品自创的诊断标准），仅覆盖"营养可干预"的常见指标。
// 肝肾功能等更专业的指标不在此处分级，一律建议咨询医生。
//
// ⚠️ 重要：这不是医学诊断工具，任何"高风险"结果都应以医生诊断为准。
// ============================================================

export type RiskTier = 'normal' | 'mild' | 'high';

export interface IndicatorDefinition {
  key: string;
  label: string;
  unit: string;
  // 数值越高越差，还是越低越差
  direction: 'higher_is_worse' | 'lower_is_worse';
  normalBound: number; // 正常范围的边界值
  mildBound: number; // 超过这个值就属于"高风险，建议就医"，中间地带算"轻度异常"
  nutritionTip: string; // 轻度异常时给出的通用饮食建议（非治疗方案）
}

export const INDICATORS: IndicatorDefinition[] = [
  {
    key: 'fasting_glucose',
    label: '空腹血糖',
    unit: 'mmol/L',
    direction: 'higher_is_worse',
    normalBound: 5.6,
    mildBound: 7.0,
    nutritionTip: '适度减少精制糖和精制碳水的摄入，增加全谷物、蔬菜比例，规律三餐有助于血糖稳定。',
  },
  {
    key: 'hba1c',
    label: '糖化血红蛋白 (HbA1c)',
    unit: '%',
    direction: 'higher_is_worse',
    normalBound: 5.7,
    mildBound: 6.5,
    nutritionTip: '关注长期饮食结构，减少添加糖摄入，保持规律运动有助于改善长期血糖控制。',
  },
  {
    key: 'total_cholesterol',
    label: '总胆固醇',
    unit: 'mmol/L',
    direction: 'higher_is_worse',
    normalBound: 5.2,
    mildBound: 6.2,
    nutritionTip: '减少饱和脂肪（红肉肥肉、油炸食品）摄入，增加膳食纤维和不饱和脂肪（坚果、深海鱼）比例。',
  },
  {
    key: 'ldl_c',
    label: '低密度脂蛋白 (LDL-C)',
    unit: 'mmol/L',
    direction: 'higher_is_worse',
    normalBound: 3.4,
    mildBound: 4.1,
    nutritionTip: '减少反式脂肪和饱和脂肪摄入，多摄入燕麦、豆类等富含可溶性膳食纤维的食物。',
  },
  {
    key: 'hdl_c',
    label: '高密度脂蛋白 (HDL-C)',
    unit: 'mmol/L',
    direction: 'lower_is_worse',
    normalBound: 1.0,
    mildBound: 0.9,
    nutritionTip: '增加规律有氧运动，适量摄入不饱和脂肪（橄榄油、坚果、深海鱼）有助于提升HDL水平。',
  },
  {
    key: 'triglycerides',
    label: '甘油三酯',
    unit: 'mmol/L',
    direction: 'higher_is_worse',
    normalBound: 1.7,
    mildBound: 2.3,
    nutritionTip: '减少精制糖、酒精和精制碳水摄入，控制总热量，规律运动有助于降低甘油三酯。',
  },
  {
    key: 'uric_acid',
    label: '尿酸',
    unit: 'µmol/L',
    direction: 'higher_is_worse',
    normalBound: 420,
    mildBound: 480,
    nutritionTip: '减少高嘌呤食物（内脏、部分海鲜、浓肉汤）和酒精摄入，多喝水，适量摄入低脂乳制品。',
  },
  {
    key: 'systolic_bp',
    label: '收缩压',
    unit: 'mmHg',
    direction: 'higher_is_worse',
    normalBound: 130,
    mildBound: 140,
    nutritionTip: '减少钠盐摄入（少吃加工食品、酱料），增加钾摄入（蔬菜水果），有助于血压管理。',
  },
];

export interface ClassifiedIndicator {
  key: string;
  label: string;
  unit: string;
  value: number;
  tier: RiskTier;
  nutritionTip?: string;
}

export function classifyIndicator(key: string, value: number): ClassifiedIndicator | null {
  const def = INDICATORS.find((d) => d.key === key);
  if (!def) return null;

  let tier: RiskTier;
  if (def.direction === 'higher_is_worse') {
    tier = value < def.normalBound ? 'normal' : value < def.mildBound ? 'mild' : 'high';
  } else {
    tier = value > def.normalBound ? 'normal' : value > def.mildBound ? 'mild' : 'high';
  }

  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    value,
    tier,
    nutritionTip: tier === 'mild' ? def.nutritionTip : undefined,
  };
}

/**
 * 综合多个指标得出整体风险等级：只要有一项高风险，整体就是高风险；
 * 没有高风险但有轻度异常，整体算轻度；全部正常才是正常
 */
export function getOverallRisk(classified: ClassifiedIndicator[]): RiskTier {
  if (classified.some((c) => c.tier === 'high')) return 'high';
  if (classified.some((c) => c.tier === 'mild')) return 'mild';
  return 'normal';
}

export const RISK_TIER_LABELS: Record<RiskTier, { label: string; color: string }> = {
  normal: { label: '正常', color: '#2E7D5B' },
  mild: { label: '轻度异常', color: '#F4B942' },
  high: { label: '建议就医', color: '#E07A5F' },
};
