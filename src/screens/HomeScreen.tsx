import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { checkAndAdjustPlan } from '../lib/planAdjustment';
import {
  calculateLoggingStreak,
  detectNudges,
  getStreakBadges,
  requestNotificationPermission,
  scheduleDailyReminder,
  Nudge,
} from '../lib/behaviorSupport';
import { FoodLog } from '../types';
import { requestWearablePermissions, syncWearableData } from '../lib/wearableSync';

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function HomeScreen({ navigation }: any) {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const activePlan = useAppStore((s) => s.activePlan);
  const setActivePlan = useAppStore((s) => s.setActivePlan);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [streak, setStreak] = useState(0);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [syncingWearable, setSyncingWearable] = useState(false);

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
    Alert.alert('同步完成', `已同步 ${count} 条体重记录`);
  }

  async function handleSaveWeight() {
    if (!session?.user?.id || !weightInput) return;
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight <= 0) {
      Alert.alert('提示', '请输入有效的体重数值');
      return;
    }
    setSavingWeight(true);
    const { error } = await supabase.from('body_metrics').insert({
      user_id: session.user.id,
      weight_kg: weight,
      source: 'manual',
    });
    setSavingWeight(false);
    if (error) {
      Alert.alert('保存失败', error.message);
    } else {
      setWeightModalVisible(false);
      setWeightInput('');
    }
  }

  async function handleManualEvaluate() {
    if (!session?.user?.id || !profile || !activePlan) return;
    setEvaluating(true);
    const updated = await checkAndAdjustPlan(session.user.id, profile, activePlan, true);
    setActivePlan(updated);
    setEvaluating(false);
  }

  const fetchTodayLogs = useCallback(async () => {
    if (!session?.user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('log_date', today);
    setTodayLogs(data ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchTodayLogs();
      if (session?.user?.id) {
        calculateLoggingStreak(session.user.id).then(setStreak);
        detectNudges(session.user.id).then(setNudges);
      }
    }, [fetchTodayLogs, session])
  );

  // 首次进入首页时请求通知权限并设置每日提醒（用户可在系统设置里随时关闭）
  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      if (granted) scheduleDailyReminder(20, 0);
    });
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await fetchTodayLogs();
    setRefreshing(false);
  }

  const totals = todayLogs.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories_kcal || 0),
      protein: acc.protein + (log.protein_g || 0),
      carbs: acc.carbs + (log.carbs_g || 0),
      fat: acc.fat + (log.fat_g || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  if (!activePlan) {
    return (
      <View style={styles.center}>
        <Text>还没有生成方案</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>今日概览</Text>

      {streak > 0 && (
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>🔥 已连续打卡 {streak} 天</Text>
        </View>
      )}

      {nudges.map((nudge) => (
        <View key={nudge.id} style={styles.nudgeCard}>
          <Text style={styles.nudgeText}>{nudge.message}</Text>
        </View>
      ))}

      <View style={styles.calorieCard}>
        <Text style={styles.calorieValue}>
          {Math.round(totals.calories)}
          <Text style={styles.calorieTarget}> / {activePlan.daily_calories_kcal} kcal</Text>
        </Text>
        <ProgressBar
          value={totals.calories}
          max={activePlan.daily_calories_kcal}
          color="#2E7D5B"
        />
      </View>

      <View style={styles.macroRow}>
        <MacroItem label="蛋白质" value={totals.protein} target={activePlan.protein_g} color="#E07A5F" />
        <MacroItem label="碳水" value={totals.carbs} target={activePlan.carbs_g} color="#3D8BFD" />
        <MacroItem label="脂肪" value={totals.fat} target={activePlan.fat_g} color="#F4B942" />
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.logButton, { flex: 1 }]}
          onPress={() => navigation.navigate('LogFood')}
        >
          <Text style={styles.logButtonText}>+ 记录一餐</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.weightButton, { flex: 1 }]}
          onPress={() => setWeightModalVisible(true)}
        >
          <Text style={styles.weightButtonText}>+ 记录体重</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.wearableSyncLink}
        onPress={handleSyncWearable}
        disabled={syncingWearable}
      >
        <Text style={styles.wearableSyncText}>
          {syncingWearable ? '同步中...' : '⌚ 从 Apple Health / Health Connect 同步数据'}
        </Text>
      </TouchableOpacity>

      <Modal visible={weightModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>记录今日体重</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="例如 58.5"
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setWeightModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveWeight}
                disabled={savingWeight}
              >
                <Text style={styles.modalSaveText}>{savingWeight ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>方案说明</Text>
        <Text style={styles.explanationText}>{activePlan.explanation}</Text>
        <TouchableOpacity onPress={handleManualEvaluate} disabled={evaluating}>
          <Text style={styles.evaluateLink}>
            {evaluating ? '评估中...' : '立即重新评估我的方案 →'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>成就徽章</Text>
      <View style={styles.badgeRow}>
        {getStreakBadges(streak).map((badge) => (
          <View
            key={badge.id}
            style={[styles.badgeChip, badge.earned && styles.badgeChipEarned]}
          >
            <Text style={[styles.badgeText, badge.earned && styles.badgeTextEarned]}>
              {badge.earned ? '🏅 ' : '🔒 '}
              {badge.label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>今日已记录</Text>
      {todayLogs.length === 0 ? (
        <Text style={styles.emptyText}>还没有记录，去添加第一餐吧</Text>
      ) : (
        todayLogs.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <Text style={styles.logName}>{log.custom_food_name ?? '食物'}</Text>
            <Text style={styles.logMeta}>
              {log.amount_g}g · {Math.round(log.calories_kcal)} kcal
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function MacroItem({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        <Text style={styles.macroTarget}>/{target}g</Text>
      </Text>
      <ProgressBar value={value} max={target} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 22, fontWeight: '700', color: '#1F2D26', marginBottom: 16 },
  streakBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  streakText: { fontSize: 13, fontWeight: '700', color: '#B5651D' },
  nudgeCard: {
    backgroundColor: '#FEF3F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  nudgeText: { fontSize: 13, color: '#B5432E', lineHeight: 19 },
  calorieCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  calorieValue: { fontSize: 28, fontWeight: '700', color: '#1F2D26' },
  calorieTarget: { fontSize: 15, fontWeight: '400', color: '#6B7C74' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E9F0EA',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  macroItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  macroLabel: { fontSize: 12, color: '#6B7C74', marginBottom: 4 },
  macroValue: { fontSize: 16, fontWeight: '700', color: '#1F2D26' },
  macroTarget: { fontSize: 12, fontWeight: '400', color: '#6B7C74' },
  buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  logButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  logButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  weightButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E7D5B',
  },
  weightButtonText: { color: '#2E7D5B', fontSize: 16, fontWeight: '600' },
  wearableSyncLink: { alignItems: 'center', marginBottom: 20 },
  wearableSyncText: { fontSize: 13, color: '#6B7C74' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '80%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26', marginBottom: 14 },
  modalInput: {
    backgroundColor: '#F4F8F4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8E4',
    marginBottom: 16,
  },
  modalButtonRow: { flexDirection: 'row', gap: 10 },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
  },
  modalCancelText: { color: '#6B7C74', fontWeight: '600' },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2E7D5B',
  },
  modalSaveText: { color: '#fff', fontWeight: '600' },
  explanationCard: {
    backgroundColor: '#EAF3EC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  explanationTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D5B', marginBottom: 6 },
  explanationText: { fontSize: 13, color: '#3E4F46', lineHeight: 20 },
  evaluateLink: { fontSize: 12, color: '#2E7D5B', fontWeight: '600', marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26', marginBottom: 10 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  badgeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
  },
  badgeChipEarned: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 12, color: '#9AA39D' },
  badgeTextEarned: { color: '#B5651D', fontWeight: '600' },
  emptyText: { color: '#8A9990', fontSize: 13, marginBottom: 30 },
  logRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logName: { fontSize: 14, color: '#1F2D26', fontWeight: '600' },
  logMeta: { fontSize: 13, color: '#6B7C74' },
});
