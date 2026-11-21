import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get Supabase client instance
 * Uses service role key for admin operations
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return supabaseClient;
}

/**
 * Get Supabase client with anon key (for client-side operations)
 */
export function getSupabaseAnonClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey);
}

/**
 * Test Supabase connection
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    
    console.log('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Supabase connection test error:', error);
    return false;
  }
}
