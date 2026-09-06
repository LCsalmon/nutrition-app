// ============================================================
// 可穿戴设备数据接入 —— iOS HealthKit / Android Health Connect
// ============================================================
//
// ⚠️ 重要：这个模块依赖原生模块 (react-native-health / react-native-health-connect)，
// 这些模块无法在 Expo Go 里运行，必须构建"自定义开发版本"(dev client) 才能测试：
//
//   npx expo prebuild
//   npx expo run:ios      (需要 Mac + Xcode，或用 EAS Build 云端编译)
//   npx expo run:android  (需要 Android Studio，或用 EAS Build 云端编译)
//
// iOS 还需要在 Apple Developer 账号里为 App 开启 HealthKit Capability。
// Android 的 Health Connect 需要目标设备安装"健康连接"App（Android 14+ 系统自带）。
//
// 在完成上述原生构建之前，调用这里的函数会安全地失败并返回空结果，
// 不会导致 Expo Go 里的 App 崩溃。
// ============================================================

import { Platform } from 'react-native';
import { supabase } from './supabase';

export type SyncedMetric = {
  weight_kg?: number;
  active_calories_kcal?: number;
  steps?: number;
  recorded_at: string;
};

// ---------------- iOS: HealthKit ----------------
async function requestIosPermissions(): Promise<boolean> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    const permissions = {
      permissions: {
        read: [
          AppleHealthKit.Constants.Permissions.Weight,
          AppleHealthKit.Constants.Permissions.StepCount,
          AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
        ],
        write: [],
      },
    };
    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(permissions, (err: string) => {
        resolve(!err);
      });
    });
  } catch (err) {
    console.warn('HealthKit 不可用（可能还在 Expo Go 里运行，需要自定义开发版本）', err);
    return false;
  }
}

async function fetchIosData(sinceISO: string): Promise<SyncedMetric[]> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    const options = { startDate: sinceISO };

    const weightSamples = await new Promise<any[]>((resolve) => {
      AppleHealthKit.getWeightSamples(options, (err: string, results: any[]) => {
        resolve(err ? [] : results);
      });
    });

    const activeEnergySamples = await new Promise<any[]>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(options, (err: string, results: any[]) => {
        resolve(err ? [] : results);
      });
    });

    const weightMetrics: SyncedMetric[] = weightSamples.map((s) => ({
      weight_kg: s.value,
      recorded_at: s.startDate,
    }));

    // 把当天所有的活动消耗样本汇总成一条记录
    if (activeEnergySamples.length > 0) {
      const totalBurned = activeEnergySamples.reduce((sum, s) => sum + (s.value ?? 0), 0);
      weightMetrics.push({
        active_calories_kcal: totalBurned,
        recorded_at: new Date().toISOString(),
      });
    }

    return weightMetrics;
  } catch (err) {
    console.warn('读取 HealthKit 数据失败', err);
    return [];
  }
}

// ---------------- Android: Health Connect ----------------
async function requestAndroidPermissions(): Promise<boolean> {
  try {
    const { initialize, requestPermission } = require('react-native-health-connect');
    const initialized = await initialize();
    if (!initialized) return false;

    const granted = await requestPermission([
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'Steps' },
    ]);
    return granted.length > 0;
  } catch (err) {
    console.warn(
      'Health Connect 不可用（可能还在 Expo Go 里运行，需要自定义开发版本）',
      err
    );
    return false;
  }
}

async function fetchAndroidData(sinceISO: string): Promise<SyncedMetric[]> {
  try {
    const { readRecords } = require('react-native-health-connect');
    const weightResult = await readRecords('Weight', {
      timeRangeFilter: { operator: 'after', startTime: sinceISO },
    });
    const metrics: SyncedMetric[] = (weightResult.records ?? []).map((r: any) => ({
      weight_kg: r.weight?.inKilograms,
      recorded_at: r.time,
    }));

    const caloriesResult = await readRecords('ActiveCaloriesBurned', {
      timeRangeFilter: { operator: 'after', startTime: sinceISO },
    });
    const totalBurned = (caloriesResult.records ?? []).reduce(
      (sum: number, r: any) => sum + (r.energy?.inKilocalories ?? 0),
      0
    );
    if (totalBurned > 0) {
      metrics.push({ active_calories_kcal: totalBurned, recorded_at: new Date().toISOString() });
    }

    return metrics;
  } catch (err) {
    console.warn('读取 Health Connect 数据失败', err);
    return [];
  }
}

// ---------------- 统一对外接口 ----------------

/**
 * 请求可穿戴设备数据读取权限
 * 返回 false 时通常意味着：当前在 Expo Go 里运行（原生模块不可用），
 * 或用户拒绝了权限，或设备不支持
 */
export async function requestWearablePermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') return requestIosPermissions();
  if (Platform.OS === 'android') return requestAndroidPermissions();
  return false;
}

/**
 * 拉取自上次同步以来的体重/步数数据，并写入 body_metrics 表
 * 建议在用户手动点击"同步"按钮时调用，或 App 启动时静默调用一次
 */
export async function syncWearableData(userId: string, sinceDays = 30): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = since.toISOString();

  const metrics =
    Platform.OS === 'ios'
      ? await fetchIosData(sinceISO)
      : Platform.OS === 'android'
      ? await fetchAndroidData(sinceISO)
      : [];

  if (metrics.length === 0) return 0;

  const rows = metrics
    .filter((m) => m.weight_kg || m.active_calories_kcal)
    .map((m) => ({
      user_id: userId,
      weight_kg: m.weight_kg,
      active_calories_kcal: m.active_calories_kcal,
      recorded_at: m.recorded_at,
      source: Platform.OS === 'ios' ? 'apple_health' : 'google_fit',
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('body_metrics').insert(rows);
  if (error) {
    console.warn('同步可穿戴设备数据失败', error.message);
    return 0;
  }
  return rows.length;
}
