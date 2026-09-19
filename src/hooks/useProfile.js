import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export function useProfile() {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*').limit(1).maybeSingle();
      if (error) throw error;
      setProfile(data || null);
    } catch (e) {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => { load(); }, [load]);

  return { profile, loading, refresh: load, setProfile };
}