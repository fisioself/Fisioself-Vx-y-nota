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

      if (error) {
        console.error('Error fetching role:', error);
        return null;
      }
      return (data?.role as Role | undefined) ?? null;
    },
    staleTime: Infinity
  });
}
