import type { Session, Subscription, SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const assertReady = (): SupabaseClient => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
  return supabase;
};

const noopSubscription: Subscription = {
  id: 'noop',
  callback: () => {},
  unsubscribe: () => {}
};

export const authService = {
  async getSession(): Promise<Session | null> {
    const db = assertReady();
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback: (session: Session | null) => void): Subscription {
    if (!isSupabaseConfigured || !supabase) return noopSubscription;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },

  async signInWithPassword({
    email,
    password
  }: {
    email: string;
    password: string;
  }): Promise<Session | null> {
    const db = assertReady();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut(): Promise<void> {
    const db = assertReady();
    const { error } = await db.auth.signOut();
    if (error) throw error;
  }
};
