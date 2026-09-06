import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { generateInitialPlan } from '../lib/nutritionEngine';
import { calculateLoggingStreak, getStreakBadges } from '../lib/behaviorSupport';
import { ActivityLevel, FamilyMember, Gender, Goal, Profile } from '../types';

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
function MemberForm({
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

export default function ProfileScreen() {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const familyMembers = useAppStore((s) => s.familyMembers);
  const setFamilyMembers = useAppStore((s) => s.setFamilyMembers);
  const activeMemberId = useAppStore((s) => s.activeMemberId);
  const setActiveMemberId = useAppStore((s) => s.setActiveMemberId);
  const setActivePlan = useAppStore((s) => s.setActivePlan);

  const [editSelfVisible, setEditSelfVisible] = useState(false);
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        calculateLoggingStreak(session.user.id).then(setStreak);
      }
    }, [session])
  );

  async function saveSelfProfile(data: Partial<Profile>) {
    if (!session?.user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', session.user.id);
    setSaving(false);
    if (error) {
      Alert.alert('保存失败', error.message);
      return;
    }
    setProfile({ ...profile, ...data, id: session.user.id } as Profile);
    setEditSelfVisible(false);
  }

  async function saveNewMember(data: Partial<FamilyMember>) {
    if (!session?.user?.id) return;
    setSaving(true);
    const { data: inserted, error } = await supabase
      .from('family_members')
      .insert({ ...data, owner_id: session.user.id })
      .select('*')
      .single();

    if (error || !inserted) {
      setSaving(false);
      Alert.alert('保存失败', error?.message ?? '请稍后重试');
      return;
    }

    // 新增家庭成员时，立即基于其信息生成一份初始营养方案，无需单独走一遍onboarding流程
    const plan = generateInitialPlan(inserted as any);
    const { error: planError } = await supabase.from('nutrition_plans').insert({
      user_id: session.user.id,
      family_member_id: inserted.id,
      ...plan,
    });

    setSaving(false);
    if (planError) {
      Alert.alert('方案生成失败', planError.message);
    }
    setFamilyMembers([...familyMembers, inserted]);
    setAddMemberVisible(false);
  }

  async function saveEditedMember(data: Partial<FamilyMember>) {
    if (!editMember) return;
    setSaving(true);
    const { error } = await supabase
      .from('family_members')
      .update(data)
      .eq('id', editMember.id);
    setSaving(false);
    if (error) {
      Alert.alert('保存失败', error.message);
      return;
    }
    setFamilyMembers(
      familyMembers.map((m) => (m.id === editMember.id ? { ...m, ...data } : m))
    );
    setEditMember(null);
  }

  function handleDeleteMember(member: FamilyMember) {
    Alert.alert('删除家庭成员', `确定要删除「${member.name}」的档案吗？相关记录也会一并删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('family_members').delete().eq('id', member.id);
          if (error) {
            Alert.alert('删除失败', error.message);
            return;
          }
          setFamilyMembers(familyMembers.filter((m) => m.id !== member.id));
          if (activeMemberId === member.id) {
            setActiveMemberId(null);
            setActivePlan(null);
          }
        },
      },
    ]);
  }

  async function handleSwitchMember(memberId: string | null) {
    setActiveMemberId(memberId);
    if (!session?.user?.id) return;
    let query = supabase
      .from('nutrition_plans')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true);
    query = memberId ? query.eq('family_member_id', memberId) : query.is('family_member_id', null);
    const { data } = await query.maybeSingle();
    setActivePlan(data ?? null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.sectionTitle}>我的信息</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>本人</Text>
        <Text style={styles.cardMeta}>
          {profile?.gender === 'male' ? '男' : profile?.gender === 'female' ? '女' : '未填写'} ·{' '}
          {profile?.height_cm ?? '--'}cm · {profile?.weight_kg ?? '--'}kg
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => setEditSelfVisible(true)}>
            <Text style={styles.linkText}>编辑资料</Text>
          </TouchableOpacity>
          {activeMemberId !== null && (
            <TouchableOpacity onPress={() => handleSwitchMember(null)}>
              <Text style={styles.linkText}>查看本人数据</Text>
            </TouchableOpacity>
          )}
          {activeMemberId === null && <Text style={styles.currentTag}>当前查看中</Text>}
        </View>
      </View>

      <Text style={styles.sectionTitle}>家庭成员</Text>
      {familyMembers.map((member) => (
        <View key={member.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {member.name} {member.relation ? `· ${member.relation}` : ''}
          </Text>
          <Text style={styles.cardMeta}>
            {member.gender === 'male' ? '男' : '女'} · {member.height_cm}cm · {member.weight_kg}kg
          </Text>
          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => setEditMember(member)}>
              <Text style={styles.linkText}>编辑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteMember(member)}>
              <Text style={[styles.linkText, { color: '#C0392B' }]}>删除</Text>
            </TouchableOpacity>
            {activeMemberId !== member.id ? (
              <TouchableOpacity onPress={() => handleSwitchMember(member.id)}>
                <Text style={styles.linkText}>查看TA的数据</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.currentTag}>当前查看中</Text>
            )}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addMemberButton} onPress={() => setAddMemberVisible(true)}>
        <Text style={styles.addMemberButtonText}>+ 添加家庭成员</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>成就徽章</Text>
      <View style={styles.badgeRow}>
        {getStreakBadges(streak).map((badge) => (
          <View key={badge.id} style={[styles.badgeChip, badge.earned && styles.badgeChipEarned]}>
            <Text style={[styles.badgeText, badge.earned && styles.badgeTextEarned]}>
              {badge.earned ? '🏅 ' : '🔒 '}
              {badge.label}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>退出登录</Text>
      </TouchableOpacity>

      {/* 编辑本人资料 */}
      <Modal visible={editSelfVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑我的信息</Text>
            <TouchableOpacity onPress={() => setEditSelfVisible(false)}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>
          <MemberForm initial={profile ?? undefined} onSave={saveSelfProfile} saving={saving} />
        </View>
      </Modal>

      {/* 新增家庭成员 */}
      <Modal visible={addMemberVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>添加家庭成员</Text>
            <TouchableOpacity onPress={() => setAddMemberVisible(false)}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>
          <MemberForm showNameField onSave={saveNewMember} saving={saving} />
        </View>
      </Modal>

      {/* 编辑家庭成员 */}
      <Modal visible={!!editMember} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑家庭成员</Text>
            <TouchableOpacity onPress={() => setEditMember(null)}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>
          {editMember && (
            <MemberForm showNameField initial={editMember} onSave={saveEditedMember} saving={saving} />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4', padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26', marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1F2D26' },
  cardMeta: { fontSize: 13, color: '#6B7C74', marginTop: 4, marginBottom: 10 },
  cardActions: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  linkText: { fontSize: 13, color: '#2E7D5B', fontWeight: '600' },
  currentTag: { fontSize: 12, color: '#8A9990' },
  addMemberButton: {
    borderWidth: 1,
    borderColor: '#2E7D5B',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  addMemberButtonText: { color: '#2E7D5B', fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  badgeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#F0F0F0' },
  badgeChipEarned: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 12, color: '#9AA39D' },
  badgeTextEarned: { color: '#B5651D', fontWeight: '600' },
  signOutButton: { alignItems: 'center', marginTop: 30, paddingVertical: 14 },
  signOutText: { color: '#C0392B', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#F4F8F4', paddingTop: 60, paddingHorizontal: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2D26' },
  closeText: { color: '#6B7C74', fontSize: 14 },
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
