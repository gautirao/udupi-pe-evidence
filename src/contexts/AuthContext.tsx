import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'user' | 'dealer' | 'broker';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  isDealer: boolean;
  userRole: AppRole | null;
  insightsAccessUntil: string | null;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [insightsAccessUntil, setInsightsAccessUntil] = useState<string | null>(null);

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        setUserRole('user');
        setIsAdmin(false);
        setIsDealer(false);
        return;
      }

      const role = (data?.role as AppRole) || 'user';
      setUserRole(role);
      setIsAdmin(role === 'admin');
      // OR logic required during expand phase: existing sessions carry 'dealer' JWT,
      // new sessions after V41 migration will carry 'broker'. Both must grant access.
      setIsDealer(role === 'dealer' || role === 'broker');
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      setUserRole('user');
      setIsAdmin(false);
      setIsDealer(false);
    }
  }, []);

  const fetchInsightsAccess = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // insights_access_until is added by V15 migration; gracefully null until then.
      const until = (data as unknown as Record<string, unknown>)?.insights_access_until ?? null;
      setInsightsAccessUntil(typeof until === 'string' ? until : null);
    } catch {
      setInsightsAccessUntil(null);
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (user?.id) {
      await fetchUserRole(user.id);
    }
  }, [user?.id, fetchUserRole]);

  const refreshAuth = useCallback(async () => {
    if (!user?.id) return;
    await Promise.all([
      fetchUserRole(user.id),
      fetchInsightsAccess(user.id),
    ]);
  }, [user?.id, fetchUserRole, fetchInsightsAccess]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer role + profile fetch to avoid Supabase client deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchInsightsAccess(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setIsAdmin(false);
          setIsDealer(false);
          setInsightsAccessUntil(null);
        }

        if (event === 'SIGNED_OUT') {
          setUserRole(null);
          setIsAdmin(false);
          setIsDealer(false);
          setInsightsAccessUntil(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        Promise.all([
          fetchUserRole(session.user.id),
          fetchInsightsAccess(session.user.id),
        ]).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserRole, fetchInsightsAccess]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setIsAdmin(false);
    setIsDealer(false);
    setInsightsAccessUntil(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAdmin,
        isDealer,
        userRole,
        insightsAccessUntil,
        signUp,
        signIn,
        signOut,
        refreshRole,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
