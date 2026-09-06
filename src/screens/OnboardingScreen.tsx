import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { generateInitialPlan } from '../lib/nutritionEngine';
import { calculateBmi } from '../lib/bmiUtils';
import { ActivityLevel, Gender, Goal } from '../types';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: '久坐少动' },
  { value: 'light', label: '轻度运动' },
  { value: 'moderate', label: '中度运动' },
  { value: 'active', label: '高强度运动' },
  { value: 'very_active', label: '体力劳动/专业训练' },
];

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'lose_weight', label: '减脂塑形' },
  { value: 'gain_muscle', label: '增肌' },
  { value: 'maintain', label: '维持体重' },
  { value: 'blood_sugar_control', label: '控糖' },
  { value: 'pregnancy', label: '孕期营养' },
  { value: 'general_wellness', label: '日常养生' },
];

const COMMON_ALLERGIES = ['花生', '海鲜', '坚果', '牛奶/乳制品', '鸡蛋', '麸质/小麦', '大豆'];

const DIETARY_PREFERENCE_OPTIONS = ['无特殊偏好', '素食', '清真', '低碳水', '高蛋白', '无乳糖'];

const COOKING_TIME_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '基本不做饭' },
  { value: '<30min', label: '30分钟以内' },
  { value: '30-60min', label: '30-60分钟' },
  { value: '>60min', label: '60分钟以上' },
];

const EATING_OUT_OPTIONS: { value: string; label: string }[] = [
  { value: 'rarely', label: '很少外食' },
  { value: 'sometimes', label: '偶尔外食' },
  { value: 'often', label: '经常外食' },
  { value: 'mostly', label: '几乎都外食' },
];

function OptionRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.optionRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.optionChip, selected === opt.value && styles.optionChipSelected]}
          onPress={() => onSelect(opt.value)}
        >
          <Text
            style={[
              styles.optionChipText,
              selected === opt.value && styles.optionChipTextSelected,
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MultiOptionRow({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View style={styles.optionRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.optionChip, selected.includes(opt) && styles.optionChipSelected]}
          onPress={() => onToggle(opt)}
        >
          <Text
            style={[
              styles.optionChipText,
              selected.includes(opt) && styles.optionChipTextSelected,
            ]}
          >
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const session = useAppStore((s) => s.session);
  const [gender, setGender] = useState<Gender>();
  const [birthYear, setBirthYear] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>();
  const [goal, setGoal] = useState<Goal>();
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dietaryPreference, setDietaryPreference] = useState<string>();
  const [cookingTime, setCookingTime] = useState<string>();
  const [eatingOutFrequency, setEatingOutFrequency] = useState<string>();
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(false);

  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const bmiResult = heightNum > 0 && weightNum > 0 ? calculateBmi(weightNum, heightNum) : null;

  function toggleAllergy(item: string) {
    setAllergies((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  }

  async function handleSubmit() {
    if (!session?.user?.id) return;
    if (!gender || !height || !weight || !activityLevel || !goal) {
      Alert.alert('提示', '请完整填写所有信息，才能为你生成准确的方案');
      return;
    }

    setLoading(true);
    try {
      const birthDate = birthYear ? `${birthYear}-01-01` : undefined;

      const profileUpdate = {
        id: session.user.id,
        gender,
        birth_date: birthDate,
        height_cm: parseFloat(height),
        weight_kg: parseFloat(weight),
        activity_level: activityLevel,
        goal,
        allergies,
        dietary_preference: dietaryPreference,
        cooking_time_per_day: cookingTime,
        eating_out_frequency: eatingOutFrequency,
        region: region || undefined,
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileUpdate);
      if (profileError) throw profileError;

      const plan = generateInitialPlan(profileUpdate);

      const { error: planError } = await supabase.from('nutrition_plans').insert({
        user_id: session.user.id,
        ...plan,
      });
      if (planError) throw planError;

      onDone();
    } catch (err: any) {
      Alert.alert('生成方案失败', err.message ?? '请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.title}>先了解一下你</Text>
      <Text style={styles.subtitle}>这些信息用于生成你的专属营养方案</Text>

      <Text style={styles.label}>性别</Text>
      <OptionRow options={GENDER_OPTIONS} selected={gender} onSelect={setGender} />

      <Text style={styles.label}>出生年份</Text>
      <TextInput
        style={styles.input}
        placeholder="例如 1995"
        keyboardType="number-pad"
        maxLength={4}
        value={birthYear}
        onChangeText={setBirthYear}
      />

      <Text style={styles.label}>身高 (cm)</Text>
      <TextInput
        style={styles.input}
        placeholder="例如 165"
        keyboardType="decimal-pad"
        value={height}
        onChangeText={setHeight}
      />

      <Text style={styles.label}>当前体重 (kg)</Text>
      <TextInput
        style={styles.input}
        placeholder="例如 58.5"
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
      />

      {bmiResult && (
        <View style={[styles.bmiCard, { borderColor: bmiResult.color }]}>
          <Text style={styles.bmiValue}>
            BMI {bmiResult.bmi}{' '}
            <Text style={[styles.bmiLabel, { color: bmiResult.color }]}>· {bmiResult.label}</Text>
          </Text>
          <Text style={styles.bmiHint}>
            {bmiResult.inHealthyRange
              ? '在健康范围内，继续保持！'
              : '仅供参考，不代表医学诊断，具体请结合实际情况或咨询专业人士。'}
          </Text>
        </View>
      )}

      <Text style={styles.label}>日常活动水平</Text>
      <OptionRow options={ACTIVITY_OPTIONS} selected={activityLevel} onSelect={setActivityLevel} />

      <Text style={styles.label}>核心目标</Text>
      <OptionRow options={GOAL_OPTIONS} selected={goal} onSelect={setGoal} />

      <Text style={styles.sectionDivider}>为了让方案更贴合你的生活习惯</Text>

      <Text style={styles.label}>过敏原（可多选，没有可跳过）</Text>
      <MultiOptionRow options={COMMON_ALLERGIES} selected={allergies} onToggle={toggleAllergy} />

      <Text style={styles.label}>饮食偏好</Text>
      <OptionRow
        options={DIETARY_PREFERENCE_OPTIONS.map((v) => ({ value: v, label: v }))}
        selected={dietaryPreference}
        onSelect={setDietaryPreference}
      />

      <Text style={styles.label}>每天大概能花多少时间做饭</Text>
      <OptionRow options={COOKING_TIME_OPTIONS} selected={cookingTime} onSelect={setCookingTime} />

      <Text style={styles.label}>外食频率</Text>
      <OptionRow
        options={EATING_OUT_OPTIONS}
        selected={eatingOutFrequency}
        onSelect={setEatingOutFrequency}
      />

      <Text style={styles.label}>所在地区（方便推荐符合当地口味的食物，选填）</Text>
      <TextInput
        style={styles.input}
        placeholder="例如：吉隆坡 / 华南 / 华北"
        value={region}
        onChangeText={setRegion}
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>生成我的专属方案</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F4',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2D26',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7C74',
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2D26',
    marginTop: 18,
    marginBottom: 8,
  },
  sectionDivider: {
    fontSize: 13,
    color: '#8A9990',
    marginTop: 28,
    marginBottom: 4,
    fontWeight: '600',
  },
  bmiCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 14,
  },
  bmiValue: { fontSize: 16, fontWeight: '700', color: '#1F2D26' },
  bmiLabel: { fontSize: 14, fontWeight: '700' },
  bmiHint: { fontSize: 12, color: '#6B7C74', marginTop: 4, lineHeight: 17 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8E4',
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8E4',
  },
  optionChipSelected: {
    backgroundColor: '#2E7D5B',
    borderColor: '#2E7D5B',
  },
  optionChipText: {
    fontSize: 13,
    color: '#4A5A52',
  },
  optionChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
