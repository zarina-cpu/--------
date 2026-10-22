import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/AuthContext';

export default function Index() {
  const { token, loading } = useAuth();
  if (loading) return null;
  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
