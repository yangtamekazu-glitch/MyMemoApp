import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// TODO: 実際のSupabaseプロジェクトのURLとAnon Keyに後ほど置き換えてください
const supabaseUrl = 'https://vkgcnzdjrkhbgtcsrmwi.supabase.co';
const supabaseAnonKey = 'sb_publishable_TfeijuyuIxrRDw2Sswb7pw_vQj8zeYw';

const isBrowser = typeof window !== 'undefined';

const customStorage = {
  getItem: (key: string) => {
    if (!isBrowser) return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (!isBrowser) return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (!isBrowser) return Promise.resolve();
    return AsyncStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
