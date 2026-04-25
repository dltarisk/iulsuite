import { useState, useEffect } from 'react';
import { supabasePublic } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabasePublic
      .from('agents')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setAgents(data);
      });
  }, []);

  const handleLogin = async () => {
    if (!selectedId) { setError('Select your name'); return; }
    if (pin.length !== 4) { setError('PIN must be 4 digits'); return; }

    setLoading(true);
    setError('');
    try {
      await login(selectedId, pin);
    } catch (err) {
      setError(err.message || 'Incorrect PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="bg-[#0a1120] px-6 py-2">
        <a href="/" className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          <span>&larr;</span> Back to Application
        </a>
      </div>
      <div className="min-h-screen bg-gradient-to-br from-[#0f1a2e] via-[#1b2a4a] to-[#0f1a2e] flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 36px)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sales Portal</h1>
            <p className="text-gray-400 text-sm mt-1">Select your name and enter PIN</p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-5">
            <div>
              <label className="block text-gray-300 text-xs font-semibold uppercase tracking-wider mb-2">Agent</label>
              <select
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setError(''); }}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-900 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 16px center',
                }}
              >
                <option value="">Select...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-300 text-xs font-semibold uppercase tracking-wider mb-2">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter 4-digit PIN"
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-900 text-lg tracking-widest placeholder:text-gray-400 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
                style={{ caretColor: '#059669' }}
              />
            </div>

            {error && <p className="text-red-400 text-sm text-center font-medium">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/25"
            >
              {loading ? 'Signing in...' : 'Enter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
