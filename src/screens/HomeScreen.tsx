import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { FoodLog } from '../types';

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
  const activePlan = useAppStore((s) => s.activePlan);
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
    }, [fetchTodayLogs])
  );

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

      <TouchableOpacity
        style={styles.logButton}
        onPress={() => navigation.navigate('LogFood')}
      >
        <Text style={styles.logButtonText}>+ 记录一餐</Text>
      </TouchableOpacity>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>方案说明</Text>
        <Text style={styles.explanationText}>{activePlan.explanation}</Text>
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
  logButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  logButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  explanationCard: {
    backgroundColor: '#EAF3EC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  explanationTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D5B', marginBottom: 6 },
  explanationText: { fontSize: 13, color: '#3E4F46', lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26', marginBottom: 10 },
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
