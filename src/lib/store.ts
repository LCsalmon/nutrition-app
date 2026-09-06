import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile, NutritionPlan, FamilyMember } from '../types';

interface AppState {
  session: Session | null;
  profile: Profile | null;
  activePlan: NutritionPlan | null;
  familyMembers: FamilyMember[];
  activeMemberId: string | null; // null = 本人；否则是 family_members.id
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setActivePlan: (plan: NutritionPlan | null) => void;
  setFamilyMembers: (members: FamilyMember[]) => void;
  setActiveMemberId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  activePlan: null,
  familyMembers: [],
  activeMemberId: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setActivePlan: (activePlan) => set({ activePlan }),
  setFamilyMembers: (familyMembers) => set({ familyMembers }),
  setActiveMemberId: (activeMemberId) => set({ activeMemberId }),
}));
