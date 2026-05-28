import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, assertSupabase } from '../lib/supabaseClient';

const noopSubscription: Subscription = {
  id: 'noop',
  callback: () => {},
  unsubscribe: () => {}
};

export const authService = {
  async getSession(): Promise<Session | null> {
    const db = assertSupabase();
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
    const db = assertSupabase();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut(): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.auth.signOut();
    if (error) throw error;
  }
};
