import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { extractHealthIndicators } from '../lib/geminiHealthReport';
import {
  classifyIndicator,
  getOverallRisk,
  ClassifiedIndicator,
  RISK_TIER_LABELS,
} from '../lib/healthReportRules';

export default function HealthReportScreen() {
  const session = useAppStore((s) => s.session);
  const activeMemberId = useAppStore((s) => s.activeMemberId);
  const familyMembers = useAppStore((s) => s.familyMembers);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<ClassifiedIndicator[] | null>(null);
  const [saving, setSaving] = useState(false);

  const viewingLabel =
    activeMemberId === null
      ? '本人'
      : familyMembers.find((m) => m.id === activeMemberId)?.name ?? '家庭成员';

  async function pickImage(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('需要权限', '请在系统设置里允许访问相机/相册');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageBase64(asset.base64 ?? null);
    setMimeType(asset.mimeType ?? 'image/jpeg');
    setResults(null);
  }

  async function handleAnalyze() {
    if (!imageBase64) return;
    setAnalyzing(true);
    try {
      const raw = await extractHealthIndicators(imageBase64, mimeType);
      if (raw.length === 0) {
        Alert.alert(
          '没有识别到指标',
          '这张图片里没有找到可识别的指标数值，试试拍得更清晰一些，或者确保数值部分完整可见。'
        );
        setResults(null);
        return;
      }
      const classified = raw
        .map((r) => classifyIndicator(r.key, r.value))
        .filter((c): c is ClassifiedIndicator => c !== null);
      setResults(classified);
    } catch (err: any) {
      Alert.alert('识别失败', err.message ?? '请稍后重试');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!session?.user?.id || !results) return;
    setSaving(true);
    const overallRisk = getOverallRisk(results);
    const { error } = await supabase.from('health_reports').insert({
      user_id: session.user.id,
      family_member_id: activeMemberId,
      indicators: results,
      overall_risk: overallRisk,
    });
    setSaving(false);
    if (error) {
      Alert.alert('保存失败', error.message);
    } else {
      Alert.alert('已保存', '这份报告的识别结果已经记录下来了');
    }
  }

  const overallRisk = results ? getOverallRisk(results) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.hint}>正在为「{viewingLabel}」上传体检报告</Text>

      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerText}>
          ⚠️ 识别结果仅供参考，不能替代医生诊断。图片不会被保存到服务器，只会保存识别出的数值结果。
        </Text>
      </View>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>还没有选择图片</Text>
        </View>
      )}

      <View style={styles.pickRow}>
        <TouchableOpacity style={styles.pickButton} onPress={() => pickImage(true)}>
          <Text style={styles.pickButtonText}>📷 拍照</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pickButton} onPress={() => pickImage(false)}>
          <Text style={styles.pickButtonText}>🖼 从相册选择</Text>
        </TouchableOpacity>
      </View>

      {imageBase64 && (
        <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze} disabled={analyzing}>
          {analyzing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.analyzeButtonText}>开始识别</Text>
          )}
        </TouchableOpacity>
      )}

      {results && overallRisk && (
        <View style={styles.resultsSection}>
          <View
            style={[
              styles.overallCard,
              { borderColor: RISK_TIER_LABELS[overallRisk].color },
            ]}
          >
            <Text style={styles.overallTitle}>
              整体评估：
              <Text style={{ color: RISK_TIER_LABELS[overallRisk].color }}>
                {' '}
                {RISK_TIER_LABELS[overallRisk].label}
              </Text>
            </Text>
            {overallRisk === 'high' && (
              <Text style={styles.overallHint}>
                有指标明显超出参考范围，建议尽快就医做进一步检查，饮食调整不能替代医疗处理。
              </Text>
            )}
            {overallRisk === 'mild' && (
              <Text style={styles.overallHint}>
                部分指标轻度偏高/偏低，通常可以通过饮食和生活方式调整改善，也建议定期复查。
              </Text>
            )}
            {overallRisk === 'normal' && (
              <Text style={styles.overallHint}>识别到的指标都在正常参考范围内，继续保持良好习惯！</Text>
            )}
          </View>

          {results.map((r) => (
            <View key={r.key} style={styles.indicatorRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.indicatorLabel}>{r.label}</Text>
                <Text style={styles.indicatorValue}>
                  {r.value} {r.unit}
                </Text>
                {r.nutritionTip && <Text style={styles.indicatorTip}>💡 {r.nutritionTip}</Text>}
              </View>
              <Text style={[styles.tierTag, { color: RISK_TIER_LABELS[r.tier].color }]}>
                {RISK_TIER_LABELS[r.tier].label}
              </Text>
            </View>
          ))}

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '保存中...' : '保存这次记录'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4', padding: 20 },
  hint: { fontSize: 13, color: '#6B7C74', marginBottom: 12 },
  disclaimerCard: {
    backgroundColor: '#FEF3F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  disclaimerText: { fontSize: 12, color: '#B5432E', lineHeight: 18 },
  preview: { width: '100%', height: 220, borderRadius: 14, marginBottom: 14, backgroundColor: '#fff' },
  placeholder: {
    height: 160,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8E4',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  placeholderText: { color: '#8A9990', fontSize: 13 },
  pickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  pickButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E7D5B',
  },
  pickButtonText: { color: '#2E7D5B', fontWeight: '600', fontSize: 14 },
  analyzeButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  analyzeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultsSection: { marginTop: 4 },
  overallCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  overallTitle: { fontSize: 16, fontWeight: '700', color: '#1F2D26' },
  overallHint: { fontSize: 13, color: '#6B7C74', marginTop: 6, lineHeight: 19 },
  indicatorRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  indicatorLabel: { fontSize: 14, fontWeight: '600', color: '#1F2D26' },
  indicatorValue: { fontSize: 13, color: '#6B7C74', marginTop: 2 },
  indicatorTip: { fontSize: 12, color: '#8A9990', marginTop: 6, lineHeight: 17 },
  tierTag: { fontSize: 12, fontWeight: '700' },
  saveButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
