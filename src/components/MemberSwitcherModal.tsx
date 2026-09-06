import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { generateInitialPlan } from '../lib/nutritionEngine';
import { FamilyMember } from '../types';
import { MemberForm } from './MemberForm';

export default function MemberSwitcherModal() {
  const navigation = useNavigation<any>();
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const familyMembers = useAppStore((s) => s.familyMembers);
  const setFamilyMembers = useAppStore((s) => s.setFamilyMembers);
  const activeMemberId = useAppStore((s) => s.activeMemberId);
  const setActiveMemberId = useAppStore((s) => s.setActiveMemberId);
  const setActivePlan = useAppStore((s) => s.setActivePlan);
  const visible = useAppStore((s) => s.switcherVisible);
  const setVisible = useAppStore((s) => s.setSwitcherVisible);

  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function switchTo(memberId: string | null) {
    setActiveMemberId(memberId);
    setVisible(false);
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
      return;
    }

    const plan = generateInitialPlan(inserted as any);
    await supabase.from('nutrition_plans').insert({
      user_id: session.user.id,
      family_member_id: inserted.id,
      ...plan,
    });

    setSaving(false);
    setFamilyMembers([...familyMembers, inserted]);
    setAddMemberVisible(false);
    // 新增后直接切换过去看TA的方案，体验更连贯
    switchTo(inserted.id);
  }

  function goToProfile() {
    setVisible(false);
    navigation.navigate('Profile');
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>切换查看对象</Text>

            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={[styles.memberRow, activeMemberId === null && styles.memberRowActive]}
                onPress={() => switchTo(null)}
              >
                <Text style={styles.memberName}>本人</Text>
                {activeMemberId === null && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>

              {familyMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.memberRow, activeMemberId === member.id && styles.memberRowActive]}
                  onPress={() => switchTo(member.id)}
                >
                  <View>
                    <Text style={styles.memberName}>{member.name}</Text>
                    {!!member.relation && <Text style={styles.memberRelation}>{member.relation}</Text>}
                  </View>
                  {activeMemberId === member.id && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.addRow} onPress={() => setAddMemberVisible(true)}>
              <Text style={styles.addRowText}>+ 添加家庭成员</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingsRow} onPress={goToProfile}>
              <Text style={styles.settingsRowText}>编辑资料 / 成就 / 设置 →</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={addMemberVisible} animationType="slide">
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>添加家庭成员</Text>
            <TouchableOpacity onPress={() => setAddMemberVisible(false)}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>
          <MemberForm showNameField onSave={saveNewMember} saving={saving} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 90,
    paddingRight: 16,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: 260,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: '#8A9990', marginBottom: 8 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  memberRowActive: { backgroundColor: '#EAF3EC' },
  memberName: { fontSize: 15, color: '#1F2D26', fontWeight: '600' },
  memberRelation: { fontSize: 12, color: '#8A9990', marginTop: 2 },
  checkMark: { color: '#2E7D5B', fontWeight: '700' },
  addRow: { paddingVertical: 12, paddingHorizontal: 10, marginTop: 4 },
  addRowText: { color: '#2E7D5B', fontWeight: '600', fontSize: 14 },
  settingsRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  settingsRowText: { color: '#6B7C74', fontSize: 13 },
  formContainer: { flex: 1, backgroundColor: '#F4F8F4', paddingTop: 60, paddingHorizontal: 20 },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#1F2D26' },
  closeText: { color: '#6B7C74', fontSize: 14 },
});
