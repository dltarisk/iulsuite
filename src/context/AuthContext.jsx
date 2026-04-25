import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { createSupabaseClient, FUNCTIONS_URL, ANON_KEY } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [agent, setAgent] = useState(null);

  const supabase = useMemo(
    () => createSupabaseClient(token),
    [token]
  );

  const login = useCallback(async (agentId, pin) => {
    const res = await fetch(`${FUNCTIONS_URL}/pin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ agent_id: agentId, pin }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }

    const data = await res.json();
    setToken(data.token);
    setAgent(data.agent);
    return data.agent;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAgent(null);
  }, []);

  const value = useMemo(
    () => ({ token, agent, supabase, login, logout, isLoggedIn: !!token }),
    [token, agent, supabase, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
