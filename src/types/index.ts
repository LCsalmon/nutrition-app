export type Gender = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Goal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'blood_sugar_control'
  | 'pregnancy'
  | 'general_wellness';

export interface Profile {
  id: string;
  nickname?: string;
  gender?: Gender;
  birth_date?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: ActivityLevel;
  goal?: Goal;
  allergies?: string[];
  dietary_preference?: string;
  cooking_time_per_day?: string;
  eating_out_frequency?: string;
  region?: string;
}

export interface NutritionPlan {
  id: string;
  user_id: string;
  daily_calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_split: Record<string, number>;
  explanation: string;
  is_active: boolean;
  created_at: string;
}

export interface Food {
  id: string;
  name: string;
  category?: string;
  calories_kcal_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  fiber_g_per_100g?: number;
  common_portion_g?: number;
  common_portion_name?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLog {
  id: string;
  user_id: string;
  food_id?: string;
  custom_food_name?: string;
  meal_type: MealType;
  amount_g: number;
  calories_kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  log_date: string;
}
