import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      {/* 各画面の上のバーに表示されるタイトルを設定します */}
      <Stack.Screen name="index" options={{ title: 'メモ' }} />
      <Stack.Screen name="compe" options={{ title: 'コンペ' }} />
      <Stack.Screen name="zumen" options={{ title: 'ずめん' }} />
      <Stack.Screen name="heimen" options={{ title: 'へいめん' }} />
    </Stack>
  );
}