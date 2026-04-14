import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../utils/supabase';
import { router } from 'expo-router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const signUpWithEmail = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) Alert.alert('エラー', error.message);
    else Alert.alert('確認', '登録完了しました（メール確認が有効な場合はメールを確認してください）');
    setLoading(false);
  };

  const signInWithEmail = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('エラー', error.message);
    else router.replace('/');
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MyMemoApp ログイン</Text>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      {loading ? (
        <ActivityIndicator size="large" color="#4285F4" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.loginButton]} onPress={signInWithEmail}>
            <Text style={styles.buttonText}>ログイン</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.signupButton]} onPress={signUpWithEmail}>
            <Text style={styles.buttonText}>新規登録</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    color: '#202124',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 8,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginButton: {
    backgroundColor: '#4285F4',
  },
  signupButton: {
    backgroundColor: '#34A853',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
