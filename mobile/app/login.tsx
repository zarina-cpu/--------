import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/lib/AuthContext';
import { useAppTheme } from '@/lib/ThemeContext';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const { login, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(email.trim(), password);
        await login(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Не удалось войти. Проверьте email и пароль.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        <Text style={[styles.brand, { color: colors.text }]}>Мой Путь</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
        </Text>

        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="maria.ivanova@gmail.com"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
        />
        <TextInput
          secureTextEntry
          placeholder="Пароль"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          title={mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          onPress={submit}
          disabled={busy || !email.trim() || password.length < 4}
        />
        <PrimaryButton
          title={mode === 'login' ? 'Нет аккаунта — зарегистрироваться' : 'Уже есть аккаунт — войти'}
          variant="ghost"
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  brand: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  error: { color: '#c44', textAlign: 'center', marginBottom: 4 },
});
