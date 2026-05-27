import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const assertReady = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');
};

export const authService = {
  async getSession() {
    assertReady();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured || !supabase) return { unsubscribe: () => {} };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },

  async signInWithPassword({ email, password }) {
    assertReady();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut() {
    assertReady();
    try {
      // Hallazgo #6: Clean PHI drafts before logout
      const { draftStorage } = await import('../shared/draftStorage.js');
      if (draftStorage?.clearAll) draftStorage.clearAll();
    } catch (err) {
      console.warn('Error clearing drafts on logout:', err);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};
