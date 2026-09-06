export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export interface BmiResult {
  bmi: number;
  category: BmiCategory;
  label: string;
  color: string;
  inHealthyRange: boolean;
}

/**
 * 计算BMI并给出分类
 * 使用亚洲人群BMI标准（比WHO国际标准的分界线更严格一些，更适合马来西亚/中国用户参考）
 * 注意：这只是一个通用的健康参考指标，不是医学诊断
 */
export function calculateBmi(weightKg: number, heightCm: number): BmiResult {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const rounded = Math.round(bmi * 10) / 10;

  if (bmi < 18.5) {
    return { bmi: rounded, category: 'underweight', label: '偏瘦', color: '#3D8BFD', inHealthyRange: false };
  }
  if (bmi < 23) {
    return { bmi: rounded, category: 'normal', label: '正常范围', color: '#2E7D5B', inHealthyRange: true };
  }
  if (bmi < 27.5) {
    return { bmi: rounded, category: 'overweight', label: '超重', color: '#F4B942', inHealthyRange: false };
  }
  return { bmi: rounded, category: 'obese', label: '肥胖', color: '#E07A5F', inHealthyRange: false };
}
