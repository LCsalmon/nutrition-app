import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import LogFoodScreen from '../screens/LogFoodScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MemberSwitcherModal from '../components/MemberSwitcherModal';
import { useAppStore } from '../lib/store';

export type RootStackParamList = {
  Home: undefined;
  LogFood: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HeaderMemberButton() {
  const setSwitcherVisible = useAppStore((s) => s.setSwitcherVisible);
  return (
    <TouchableOpacity onPress={() => setSwitcherVisible(true)}>
      <Text style={{ fontSize: 22 }}>👤</Text>
    </TouchableOpacity>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#F4F8F4' } }}>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: '食愈',
            headerRight: () => <HeaderMemberButton />,
          }}
        />
        <Stack.Screen
          name="LogFood"
          component={LogFoodScreen}
          options={{ title: '记录一餐' }}
        />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
      </Stack.Navigator>
      {/* 挂载在导航容器顶层，任何页面点右上角👤都能唤起，切换后自动生效 */}
      <MemberSwitcherModal />
    </NavigationContainer>
  );
}
