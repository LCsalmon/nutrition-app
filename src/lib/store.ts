import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile, NutritionPlan } from '../types';

interface AppState {
  session: Session | null;
  profile: Profile | null;
  activePlan: NutritionPlan | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setActivePlan: (plan: NutritionPlan | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  activePlan: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setActivePlan: (activePlan) => set({ activePlan }),
}));
