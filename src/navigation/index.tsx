import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import LogFoodScreen from '../screens/LogFoodScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type RootStackParamList = {
  Home: undefined;
  LogFood: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#F4F8F4' } }}>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={({ navigation }) => ({
            title: '食愈',
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                <Text style={{ fontSize: 22 }}>👤</Text>
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="LogFood"
          component={LogFoodScreen}
          options={{ title: '记录一餐' }}
        />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '我的' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
