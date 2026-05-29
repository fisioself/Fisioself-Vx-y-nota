import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

export type Role = 'admin' | 'therapist' | 'reception' | string;

export function useRole() {
  return useQuery<Role | null, Error>({
    queryKey: ['user-role'],
    queryFn: async () => {
      if (!supabase) return null;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) return null;

      const userId = sessionData.session.user.id;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return (data?.role as Role | undefined) ?? null;
    },
    staleTime: Infinity,
    retry: (failureCount, err) => {
      const msg = (err as { message?: string })?.message ?? '';
      if (/40[134]|PGRST116/i.test(msg)) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000)
  });
}
