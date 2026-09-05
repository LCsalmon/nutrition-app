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

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const session = useAppStore((s) => s.session);
  const [gender, setGender] = useState<Gender>();
  const [birthYear, setBirthYear] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>();
  const [goal, setGoal] = useState<Goal>();
  const [loading, setLoading] = useState(false);

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

      <Text style={styles.label}>日常活动水平</Text>
      <OptionRow options={ACTIVITY_OPTIONS} selected={activityLevel} onSelect={setActivityLevel} />

      <Text style={styles.label}>核心目标</Text>
      <OptionRow options={GOAL_OPTIONS} selected={goal} onSelect={setGoal} />

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
