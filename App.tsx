import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';
import { useAppStore } from './src/lib/store';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import AppNavigator from './src/navigation';
import { checkAndAdjustPlan } from './src/lib/planAdjustment';

export default function App() {
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const activePlan = useAppStore((s) => s.activePlan);
  const setActivePlan = useAppStore((s) => s.setActivePlan);
  const setProfile = useAppStore((s) => s.setProfile);

  const [authLoading, setAuthLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);

  // 监听登录状态
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // 登录后加载资料 + 当前生效的营养方案
  useEffect(() => {
    async function loadUserData() {
      if (!session?.user?.id) {
        setActivePlan(null);
        setProfile(null);
        return;
      }
      setPlanLoading(true);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setProfile(profileData ?? null);

      const { data: planData } = await supabase
        .from('nutrition_plans')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (planData && profileData) {
        // 每次打开App时，检查方案是否满足评估周期（约12天），需要的话自动生成调整后的新方案
        const latestPlan = await checkAndAdjustPlan(session.user.id, profileData, planData);
        setActivePlan(latestPlan);
      } else {
        setActivePlan(planData ?? null);
      }

      setPlanLoading(false);
    }
    loadUserData();
  }, [session]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D5B" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <AuthScreen />
      </>
    );
  }

  if (planLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D5B" />
      </View>
    );
  }

  if (!activePlan) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingScreen
          onDone={async () => {
            // 方案生成完成后重新拉取
            if (!session.user.id) return;
            const { data } = await supabase
              .from('nutrition_plans')
              .select('*')
              .eq('user_id', session.user.id)
              .eq('is_active', true)
              .maybeSingle();
            setActivePlan(data ?? null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <AppNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
  },
});
