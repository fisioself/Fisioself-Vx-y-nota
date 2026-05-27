import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient.js';

export function useRole() {
  return useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
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
      return data?.role || null;
    },
    staleTime: Infinity // Role rarely changes during a session
  });
}
