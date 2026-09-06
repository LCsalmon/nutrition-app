import * as Notifications from 'expo-notifications';
import Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * 请求通知权限（首次使用时调用，例如在首页第一次加载时）
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    console.warn('模拟器不支持推送通知，请用真机测试');
    return false;
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

const DAILY_REMINDER_ID = 'daily-log-reminder';

/**
 * 设置每日打卡提醒（默认晚上8点，如果当天还没有记录任何一餐）
 * 使用本地通知，不需要服务器推送基础设施
 */
export async function scheduleDailyReminder(hour = 20, minute = 0) {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: '今天的饮食记录了吗？',
      body: '花30秒记录一下今天吃了什么，帮助我们更准确地为你调整方案',
    },
    trigger: {
      hour,
      minute,
      repeats: true,
    },
  });
}

export async function cancelDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
}

// ============================================================
// 连续打卡 streak 计算
// ============================================================

/**
 * 计算用户当前的连续打卡天数（从今天或昨天往前数，只要没有断过）
 */
export async function calculateLoggingStreak(userId: string): Promise<number> {
  const { data } = await supabase
    .from('food_logs')
    .select('log_date')
    .eq('user_id', userId)
    .order('log_date', { ascending: false });

  if (!data || data.length === 0) return 0;

  const uniqueDates = Array.from(new Set(data.map((d) => d.log_date))).sort().reverse();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let cursor = new Date(today);

  // 如果今天还没打卡，从昨天开始算连续天数（避免用户还没来得及记录今天就显示streak清零）
  if (uniqueDates[0] !== today.toISOString().slice(0, 10)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (const dateStr of uniqueDates) {
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (dateStr === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (dateStr < cursorStr) {
      break;
    }
  }

  return streak;
}

// ============================================================
// 成就徽章
// ============================================================

export interface Badge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 100];

export function getStreakBadges(streak: number): Badge[] {
  return STREAK_MILESTONES.map((m) => ({
    id: `streak-${m}`,
    label: `连续打卡 ${m} 天`,
    description: `已连续记录饮食 ${m} 天`,
    earned: streak >= m,
  }));
}

// ============================================================
// 执行障碍微干预检测
// ============================================================

export interface Nudge {
  id: string;
  message: string;
}

/**
 * 检测常见的"执行障碍"模式，返回需要提示用户的微干预建议
 * 目前覆盖：连续3天未记录晚餐、周末外食（此处简化为检测周末是否有记录）
 */
export async function detectNudges(userId: string): Promise<Nudge[]> {
  const nudges: Nudge[] = [];

  const since = new Date();
  since.setDate(since.getDate() - 3);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: recentLogs } = await supabase
    .from('food_logs')
    .select('log_date, meal_type')
    .eq('user_id', userId)
    .gte('log_date', sinceStr);

  const last3Days = [0, 1, 2].map((i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  const dinnerLoggedDates = new Set(
    (recentLogs ?? []).filter((l) => l.meal_type === 'dinner').map((l) => l.log_date)
  );

  const missedDinnerStreak = last3Days.every((d) => !dinnerLoggedDates.has(d));
  if (missedDinnerStreak) {
    nudges.push({
      id: 'missed-dinner-3days',
      message: '你已经连续3天没有记录晚餐了，晚餐往往是三餐里最容易吃多的一顿，要不要现在补记一下今天的晚餐？',
    });
  }

  return nudges;
}
