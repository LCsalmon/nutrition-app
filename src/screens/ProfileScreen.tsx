import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { regeneratePlan } from '../lib/planAdjustment';
import { calculateLoggingStreak, getStreakBadges } from '../lib/behaviorSupport';
import { calculateBmi } from '../lib/bmiUtils';
import { requestWearablePermissions, syncWearableData } from '../lib/wearableSync';
import { FamilyMember, Profile } from '../types';
import { MemberForm } from '../components/MemberForm';

export default function ProfileScreen() {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const familyMembers = useAppStore((s) => s.familyMembers);
  const setFamilyMembers = useAppStore((s) => s.setFamilyMembers);
  const activeMemberId = useAppStore((s) => s.activeMemberId);
  const setActiveMemberId = useAppStore((s) => s.setActiveMemberId);
  const activePlan = useAppStore((s) => s.activePlan);
  const setActivePlan = useAppStore((s) => s.setActivePlan);

  const [editSelfVisible, setEditSelfVisible] = useState(false);
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [syncingWearable, setSyncingWearable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        calculateLoggingStreak(session.user.id).then(setStreak);
      }
    }, [session])
  );

  async function handleSyncWearable() {
    if (!session?.user?.id) return;
    setSyncingWearable(true);
    const granted = await requestWearablePermissions();
    if (!granted) {
      Alert.alert(
        '暂时无法同步',
        '可穿戴设备数据接入需要自定义开发版本才能使用（当前在 Expo Go 中运行，此功能暂不可用），详见 README 说明。'
      );
      setSyncingWearable(false);
      return;
    }
    const count = await syncWearableData(session.user.id);
    setSyncingWearable(false);
    Alert.alert('同步完成', `已同步 ${count} 条数据`);
  }

  async function saveSelfProfile(data: Partial<Profile>) {
    if (!session?.user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', session.user.id);

    if (error) {
      setSaving(false);
      Alert.alert('保存失败', error.message);
      return;
    }

    const updatedProfile = { ...profile, ...data, id: session.user.id } as Profile;
    setProfile(updatedProfile);

    // 身高体重等信息变了，摄入目标也要跟着重新计算，不用等12天的自动评估
    const newPlan = await regeneratePlan(session.user.id, null, updatedProfile);
    if (newPlan && activeMemberId === null) {
      setActivePlan(newPlan);
    }

    setSaving(false);
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

    const newPlan = await regeneratePlan(session.user.id, inserted.id, inserted as any, '');
    setSaving(false);
    if (!newPlan) {
      Alert.alert('方案生成失败', '请稍后在首页手动重新评估');
    }
    setFamilyMembers([...familyMembers, inserted]);
    setAddMemberVisible(false);
  }

  async function saveEditedMember(data: Partial<FamilyMember>) {
    if (!editMember || !session?.user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('family_members')
      .update(data)
      .eq('id', editMember.id);

    if (error) {
      setSaving(false);
      Alert.alert('保存失败', error.message);
      return;
    }

    const updatedMember = { ...editMember, ...data };
    setFamilyMembers(familyMembers.map((m) => (m.id === editMember.id ? updatedMember : m)));

    // 同样，家庭成员的信息更新后也要重新生成方案
    const newPlan = await regeneratePlan(session.user.id, editMember.id, updatedMember as any);
    if (newPlan && activeMemberId === editMember.id) {
      setActivePlan(newPlan);
    }

    setSaving(false);
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

  const selfBmi =
    profile?.height_cm && profile?.weight_kg
      ? calculateBmi(profile.weight_kg, profile.height_cm)
      : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.sectionTitle}>我的信息</Text>
      <Text style={styles.hint}>点击整行可以切换首页查看的对象</Text>

      <TouchableOpacity
        style={[styles.card, activeMemberId === null && styles.cardActive]}
        onPress={() => handleSwitchMember(null)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>本人</Text>
          <Text style={styles.cardMeta}>
            {profile?.gender === 'male' ? '男' : profile?.gender === 'female' ? '女' : '未填写'} ·{' '}
            {profile?.height_cm ?? '--'}cm · {profile?.weight_kg ?? '--'}kg
            {selfBmi ? ` · BMI ${selfBmi.bmi} (${selfBmi.label})` : ''}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => setEditSelfVisible(true)} hitSlop={8}>
            <Text style={styles.linkText}>编辑</Text>
          </TouchableOpacity>
          {activeMemberId === null && <Text style={styles.currentTag}>✓ 查看中</Text>}
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>家庭成员</Text>
      {familyMembers.map((member) => {
        const memberBmi =
          member.height_cm && member.weight_kg
            ? calculateBmi(member.weight_kg, member.height_cm)
            : null;
        return (
          <TouchableOpacity
            key={member.id}
            style={[styles.card, activeMemberId === member.id && styles.cardActive]}
            onPress={() => handleSwitchMember(member.id)}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {member.name} {member.relation ? `· ${member.relation}` : ''}
              </Text>
              <Text style={styles.cardMeta}>
                {member.gender === 'male' ? '男' : '女'} · {member.height_cm}cm · {member.weight_kg}kg
                {memberBmi ? ` · BMI ${memberBmi.bmi} (${memberBmi.label})` : ''}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => setEditMember(member)} hitSlop={8}>
                <Text style={styles.linkText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteMember(member)} hitSlop={8}>
                <Text style={[styles.linkText, { color: '#C0392B' }]}>删除</Text>
              </TouchableOpacity>
              {activeMemberId === member.id && <Text style={styles.currentTag}>✓ 查看中</Text>}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.addMemberButton} onPress={() => setAddMemberVisible(true)}>
        <Text style={styles.addMemberButtonText}>+ 添加家庭成员</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>可穿戴设备</Text>
      <View style={styles.card}>
        <Text style={styles.cardMeta}>
          连接 Apple Health / Health Connect 后可自动同步体重和消耗数据（需要自定义开发版本才能使用，详见项目 README）
        </Text>
        <TouchableOpacity onPress={handleSyncWearable} disabled={syncingWearable} style={{ marginTop: 10 }}>
          <Text style={styles.linkText}>{syncingWearable ? '同步中...' : '⌚ 立即同步'}</Text>
        </TouchableOpacity>
      </View>

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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26', marginTop: 20, marginBottom: 6 },
  hint: { fontSize: 12, color: '#8A9990', marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardActive: { borderWidth: 1.5, borderColor: '#2E7D5B' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1F2D26' },
  cardMeta: { fontSize: 13, color: '#6B7C74', marginTop: 4 },
  cardActions: { alignItems: 'flex-end', gap: 8 },
  linkText: { fontSize: 13, color: '#2E7D5B', fontWeight: '600' },
  currentTag: { fontSize: 11, color: '#2E7D5B', fontWeight: '700' },
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
});
