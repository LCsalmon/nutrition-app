import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { ActivityLevel, FamilyMember, Gender, Goal, Profile } from '../types';
import { calculateBmi } from '../lib/bmiUtils';

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

function Chip<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T | undefined;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, selected === opt.value && styles.chipSelected]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={[styles.chipText, selected === opt.value && styles.chipTextSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// 共用的成员信息表单（用于编辑本人资料 / 新增或编辑家庭成员）
export function MemberForm({
  initial,
  showNameField,
  onSave,
  saving,
}: {
  initial?: Partial<FamilyMember & Profile>;
  showNameField?: boolean;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [relation, setRelation] = useState(initial?.relation ?? '');
  const [gender, setGender] = useState<Gender | undefined>(initial?.gender);
  const [birthYear, setBirthYear] = useState(
    initial?.birth_date ? initial.birth_date.slice(0, 4) : ''
  );
  const [height, setHeight] = useState(initial?.height_cm ? String(initial.height_cm) : '');
  const [weight, setWeight] = useState(initial?.weight_kg ? String(initial.weight_kg) : '');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>(
    initial?.activity_level
  );
  const [goal, setGoal] = useState<Goal | undefined>(initial?.goal);

  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);
  const bmiResult =
    heightNum > 0 && weightNum > 0 ? calculateBmi(weightNum, heightNum) : null;

  function handleSubmit() {
    if (!gender || !height || !weight || !activityLevel || !goal) {
      Alert.alert('提示', '请完整填写信息');
      return;
    }
    onSave({
      name: name || undefined,
      relation: relation || undefined,
      gender,
      birth_date: birthYear ? `${birthYear}-01-01` : undefined,
      height_cm: parseFloat(height),
      weight_kg: parseFloat(weight),
      activity_level: activityLevel,
      goal,
    });
  }

  return (
    <ScrollView>
      {showNameField && (
        <>
          <Text style={styles.label}>称呼</Text>
          <TextInput style={styles.input} placeholder="例如：妈妈、小明" value={name} onChangeText={setName} />
          <Text style={styles.label}>关系</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：配偶、子女、父母"
            value={relation}
            onChangeText={setRelation}
          />
        </>
      )}

      <Text style={styles.label}>性别</Text>
      <Chip options={GENDER_OPTIONS} selected={gender} onSelect={setGender} />

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
        keyboardType="decimal-pad"
        value={height}
        onChangeText={setHeight}
      />

      <Text style={styles.label}>体重 (kg)</Text>
      <TextInput
        style={styles.input}
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

      <Text style={styles.label}>活动水平</Text>
      <Chip options={ACTIVITY_OPTIONS} selected={activityLevel} onSelect={setActivityLevel} />

      <Text style={styles.label}>目标</Text>
      <Chip options={GOAL_OPTIONS} selected={goal} onSelect={setGoal} />

      <TouchableOpacity style={styles.saveButton} onPress={handleSubmit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>保存</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#1F2D26', marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8E4',
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8E4',
  },
  chipSelected: { backgroundColor: '#2E7D5B', borderColor: '#2E7D5B' },
  chipText: { fontSize: 13, color: '#4A5A52' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  saveButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
