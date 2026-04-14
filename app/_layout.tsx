import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';

export default function Layout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, isReady, segments]);

  if (!isReady) {
    return null; // Or a loading screen
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
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
