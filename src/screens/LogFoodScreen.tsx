import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { searchUsdaFoods } from '../lib/usdaApi';
import { Food, MealType } from '../types';

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '加餐' },
];

export default function LogFoodScreen({ navigation }: any) {
  const session = useAppStore((s) => s.session);
  const activeMemberId = useAppStore((s) => s.activeMemberId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  async function search(text: string) {
    setQuery(text);
    if (text.length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    // 本地库和 USDA 并行搜索，本地库优先展示（本地维护的常见食物+之前缓存过的USDA食物）
    const [localResult, usdaResult] = await Promise.all([
      supabase.from('foods').select('*').ilike('name', `%${text}%`).limit(20),
      searchUsdaFoods(text, 15),
    ]);
    const localFoods = localResult.data ?? [];
    const localNames = new Set(localFoods.map((f) => f.name.toLowerCase()));
    // 去重：如果本地库已经有同名食物（说明之前缓存过），就不重复展示 USDA 的那条
    const dedupedUsda = usdaResult.filter((f) => !localNames.has(f.name.toLowerCase()));
    setResults([...localFoods, ...dedupedUsda]);
    setSearching(false);
  }

  function pickFood(food: Food) {
    setSelectedFood(food);
    setAmount(food.common_portion_g ? String(food.common_portion_g) : '100');
  }

  // USDA 食物首次被选中记录时，写入本地 foods 表缓存一份，
  // 这样以后同一份用户/其他用户搜索会直接命中本地库，且能满足 food_logs 外键约束
  async function resolveLocalFoodId(food: Food): Promise<string | null> {
    if (!food.id.startsWith('usda-')) return food.id;

    const { data: existing } = await supabase
      .from('foods')
      .select('id')
      .eq('name', food.name)
      .eq('source', 'usda')
      .maybeSingle();
    if (existing) return existing.id;

    const { data: inserted, error } = await supabase
      .from('foods')
      .insert({
        name: food.name,
        category: food.category,
        calories_kcal_per_100g: food.calories_kcal_per_100g,
        protein_g_per_100g: food.protein_g_per_100g,
        carbs_g_per_100g: food.carbs_g_per_100g,
        fat_g_per_100g: food.fat_g_per_100g,
        fiber_g_per_100g: food.fiber_g_per_100g,
        source: 'usda',
        created_by: session?.user?.id,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('缓存USDA食物失败', error.message);
      return null;
    }
    return inserted.id;
  }

  async function handleSave() {
    if (!session?.user?.id || !selectedFood || !amount) {
      Alert.alert('提示', '请选择食物并填写分量');
      return;
    }
    const grams = parseFloat(amount);
    if (isNaN(grams) || grams <= 0) {
      Alert.alert('提示', '请输入有效的克数');
      return;
    }

    const ratio = grams / 100;
    setSaving(true);

    const foodId = await resolveLocalFoodId(selectedFood);

    const { error } = await supabase.from('food_logs').insert({
      user_id: session.user.id,
      family_member_id: activeMemberId,
      food_id: foodId,
      custom_food_name: selectedFood.name,
      meal_type: mealType,
      amount_g: grams,
      calories_kcal: selectedFood.calories_kcal_per_100g * ratio,
      protein_g: selectedFood.protein_g_per_100g * ratio,
      carbs_g: selectedFood.carbs_g_per_100g * ratio,
      fat_g: selectedFood.fat_g_per_100g * ratio,
    });
    setSaving(false);

    if (error) {
      Alert.alert('保存失败', error.message);
    } else {
      navigation.goBack();
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="搜索食物，如：米饭、鸡胸肉"
        value={query}
        onChangeText={search}
      />

      {!selectedFood && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.foodRow} onPress={() => pickFood(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodName}>{item.name}</Text>
                <Text style={styles.foodMeta}>
                  {Math.round(item.calories_kcal_per_100g)} kcal/100g
                  {item.id.startsWith('usda-') ? ' · USDA' : ''}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length > 0 && !searching ? (
              <Text style={styles.emptyText}>没有找到匹配的食物，可尝试其他关键词</Text>
            ) : null
          }
        />
      )}

      {selectedFood && (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{selectedFood.name}</Text>

          <Text style={styles.label}>餐次</Text>
          <View style={styles.mealRow}>
            {MEAL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.mealChip,
                  mealType === opt.value && styles.mealChipSelected,
                ]}
                onPress={() => setMealType(opt.value)}
              >
                <Text
                  style={[
                    styles.mealChipText,
                    mealType === opt.value && styles.mealChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>分量 (g)</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? '保存中...' : '保存记录'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setSelectedFood(null)}>
            <Text style={styles.backText}>重新选择食物</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4', padding: 20 },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8E4',
    marginBottom: 12,
  },
  foodRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foodName: { fontSize: 15, color: '#1F2D26', fontWeight: '600' },
  foodMeta: { fontSize: 13, color: '#6B7C74' },
  emptyText: { color: '#8A9990', fontSize: 13, marginTop: 20, textAlign: 'center' },
  detailCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#1F2D26', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7C74', marginBottom: 8 },
  mealRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  mealChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F4F8F4',
    borderWidth: 1,
    borderColor: '#E2E8E4',
  },
  mealChipSelected: { backgroundColor: '#2E7D5B', borderColor: '#2E7D5B' },
  mealChipText: { fontSize: 13, color: '#4A5A52' },
  mealChipTextSelected: { color: '#fff', fontWeight: '600' },
  amountInput: {
    backgroundColor: '#F4F8F4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8E4',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#2E7D5B',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backText: { textAlign: 'center', color: '#6B7C74', fontSize: 13 },
});
