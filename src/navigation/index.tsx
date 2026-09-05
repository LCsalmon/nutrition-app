import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import LogFoodScreen from '../screens/LogFoodScreen';

export type RootStackParamList = {
  Home: undefined;
  LogFood: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#F4F8F4' } }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: '食愈' }} />
        <Stack.Screen
          name="LogFood"
          component={LogFoodScreen}
          options={{ title: '记录一餐' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
