/**
 * Shared React Query hooks for commonly needed data that is fetched
 * identically across multiple screens. Using the same query key means the
 * result is cached and shared — only one network call is ever made.
 */
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from './supabase';
import { useAuth } from '../features/auth/AuthProvider';

/**
 * Returns the authenticated user's member record ID, looked up via the
 * `current_member_id` RPC which maps `auth.uid()` → `members.id` server-side.
 *
 * The result is stable for the lifetime of a session and is cached globally,
 * so all screens that call this hook share a single fetch.
 */
export function useCurrentMemberId(): {
  memberId: string | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const { session } = useAuth();

  const query = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async (): Promise<string> => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      if (typeof data !== 'string' || !data) {
        throw new Error('current_member_id RPC returned an unexpected value.');
      }
      return data;
    },
    // Only run when there is an authenticated session.
    enabled: Boolean(session?.user?.id),
    // Member ID is stable for the lifetime of a session.
    staleTime: Infinity,
  });

  return {
    memberId: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
