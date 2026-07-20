import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';

const AUTH_REDIRECT_URL = 'homebridge://auth/callback';

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthParameters(url: string): URLSearchParams {
  const parsedUrl = new URL(url);
  const parameters = new URLSearchParams(parsedUrl.search);

  const hash = url.includes('#')
    ? url.substring(url.indexOf('#') + 1)
    : '';

  if (hash) {
    const hashParameters = new URLSearchParams(hash);

    hashParameters.forEach((value, key) => {
      if (!parameters.has(key)) {
        parameters.set(key, value);
      }
    });
  }

  return parameters;
}

async function createSessionFromUrl(url: string): Promise<void> {
  if (!supabase || !url.startsWith('homebridge://')) {
    return;
  }

  const parameters = getAuthParameters(url);
  const errorDescription =
    parameters.get('error_description') ??
    parameters.get('error');

  if (errorDescription) {
    throw new Error(errorDescription);
  }

  const code = parameters.get('code');

  if (code) {
    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    return;
  }

  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
  }
}

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] =
    useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const handleUrl = (url: string | null) => {
      if (!url) {
        return;
      }

      createSessionFromUrl(url).catch((error: unknown) => {
        console.error(
          'HomeBridge authentication link failed:',
          error,
        );
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    Linking.getInitialURL().then(handleUrl);

    const linkingListener = Linking.addEventListener(
      'url',
      ({ url }) => handleUrl(url),
    );

    const { data: authListener } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          setSession(nextSession);
          setLoading(false);
        },
      );

    return () => {
      linkingListener.remove();
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,

      signIn: async (
        email: string,
        password: string,
      ) => {
        if (!supabase) {
          throw new Error('Supabase is not configured.');
        }

        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) {
          throw error;
        }
      },

      signUp: async (
        email: string,
        password: string,
        displayName: string,
      ) => {
        if (!supabase) {
          throw new Error('Supabase is not configured.');
        }

        const { data, error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: AUTH_REDIRECT_URL,
              data: {
                display_name: displayName.trim(),
              },
            },
          });

        if (error) {
          throw error;
        }

        return {
          needsConfirmation: !data.session,
        };
      },

      signOut: async () => {
        if (!supabase) {
          return;
        }

        const { error } =
          await supabase.auth.signOut();

        if (error) {
          throw error;
        }
      },
    }),
    [loading, session],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    );
  }

  return value;
}
