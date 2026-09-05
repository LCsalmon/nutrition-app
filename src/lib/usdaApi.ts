// USDA FoodData Central API 封装
// 文档: https://fdc.nal.usda.gov/api-guide.html
import { Food } from '../types';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY as string;
const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// USDA 营养素 ID 对照表 (per 100g)
const NUTRIENT_IDS = {
  ENERGY_KCAL: 1008,
  PROTEIN: 1003,
  FAT: 1004,
  CARBS: 1005,
  FIBER: 1079,
};

interface UsdaFoodNutrient {
  nutrientId: number;
  value: number;
}

interface UsdaFoodItem {
  fdcId: number;
  description: string;
  foodNutrients: UsdaFoodNutrient[];
}

function extractNutrient(nutrients: UsdaFoodNutrient[], id: number): number {
  const match = nutrients.find((n) => n.nutrientId === id);
  return match ? match.value : 0;
}

// 将 USDA 返回的食物条目转换成 App 内统一的 Food 结构
// USDA 的数据默认就是"每100g"为单位，与本地食物库保持一致，便于统一计算
function mapUsdaItemToFood(item: UsdaFoodItem): Food {
  return {
    id: `usda-${item.fdcId}`, // 前缀区分，避免与本地 uuid 冲突
    name: item.description,
    category: 'USDA',
    calories_kcal_per_100g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.ENERGY_KCAL),
    protein_g_per_100g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.PROTEIN),
    carbs_g_per_100g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.CARBS),
    fat_g_per_100g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.FAT),
    fiber_g_per_100g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.FIBER),
    common_portion_g: 100,
    common_portion_name: '100g',
  };
}

/**
 * 搜索 USDA 食物数据库
 * 优先使用 "Foundation" 和 "SR Legacy" 数据类型（营养数据比较完整可靠）
 */
export async function searchUsdaFoods(query: string, pageSize = 15): Promise<Food[]> {
  if (!USDA_API_KEY) {
    console.warn('⚠️ 缺少 USDA_API_KEY，跳过 USDA 搜索');
    return [];
  }
  if (!query.trim()) return [];

  try {
    const url = `${BASE_URL}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(
      query
    )}&pageSize=${pageSize}&dataType=Foundation,SR Legacy,Survey (FNDDS)`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn('USDA API 请求失败', res.status);
      return [];
    }
    const json = await res.json();
    const items: UsdaFoodItem[] = json.foods ?? [];
    return items
      .map(mapUsdaItemToFood)
      .filter((f) => f.calories_kcal_per_100g > 0); // 过滤掉没有热量数据的脏数据
  } catch (err) {
    console.warn('USDA 搜索出错', err);
    return [];
  }
}
