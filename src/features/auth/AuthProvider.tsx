import { PropsWithChildren, createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    const client = getSupabase();
    const applyAuthRedirect = async (url: string | null) => {
      if (!url) return;
      const fragment = url.split('#')[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return;
      const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!error) setSession(data.session);
    };
    void Linking.getInitialURL().then(applyAuthRedirect);
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => void applyAuthRedirect(url));
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      linkingSubscription.remove();
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        async signInWithMagicLink(email) {
          const { error } = await getSupabase().auth.signInWithOtp({
            email,
            options: { emailRedirectTo: 'triplit://auth/callback' },
          });
          if (error) throw error;
        },
        async signOut() {
          const { error } = await getSupabase().auth.signOut();
          if (error) throw error;
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
