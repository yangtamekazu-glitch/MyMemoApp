import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      {/* アプリ左上のタイトルなどを「メモアプリ」に変更＆不要なヘッダーを非表示 */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'メモアプリ' }} />
      {/* 各画面の上のバーに表示されるタイトルを設定します */}
      <Stack.Screen name="index" options={{ title: 'メモアプリ' }} />
      <Stack.Screen name="compe" options={{ title: 'コンペ' }} />
      <Stack.Screen name="zumen" options={{ title: 'ずめん' }} />
      <Stack.Screen name="heimen" options={{ title: 'へいめん' }} />
    </Stack>
  );
}
