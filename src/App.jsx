import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './components/LoginScreen';
import TeamDashboard from './components/TeamDashboard';
import MyDashboard from './components/MyDashboard';
import MyDeals from './components/MyDeals';
import Overrides from './components/Overrides';
import AdminPanel from './components/AdminPanel';
import PreApplications from './components/PreApplications';

function Dashboard() {
  const { agent, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    if (agent.role === 'admin') return 'dashboard';
    if (agent.role === 'admin_agent') return 'dashboard';
    return 'my-dashboard';
  });

  const isAdmin = agent.role === 'admin';
  const isAdminAgent = agent.role === 'admin_agent';
  const canAdmin = isAdmin || isAdminAgent;

  const tabs = [];
  tabs.push({ id: 'dashboard', label: 'Team Dashboard', icon: '\uD83D\uDCCA' });
  tabs.push({ id: 'my-dashboard', label: 'My Dashboard', icon: '\uD83D\uDCC8' });
  tabs.push({ id: 'my-deals', label: 'My Deals', icon: '\uD83D\uDCCB' });
  tabs.push({ id: 'overrides', label: 'Overrides', icon: '\uD83D\uDCB0' });
  tabs.push({ id: 'pre-apps', label: 'Pre-Apps', icon: '\uD83D\uDCDD' });
  if (canAdmin) tabs.push({ id: 'admin', label: 'Admin', icon: '\u2699\uFE0F' });

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-navy text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-bold text-sm">Sales Portal</span>
          <span className="text-gray-400 text-xs">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-200">
            {agent.name}
            {(isAdminAgent || isAdmin) && (
              <span className="ml-2 text-xs bg-gold text-navy px-2 py-0.5 rounded-full font-bold">
                {isAdmin ? 'ADMIN' : 'MASTER'}
              </span>
            )}
          </span>
          <a href="/" className="text-gray-400 hover:text-white text-xs">Pre-App</a>
          <button onClick={logout} className="text-gray-400 hover:text-white text-sm">Sign Out</button>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-6 overflow-x-auto">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'border-emerald-500 text-navy'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' && <TeamDashboard />}
        {activeTab === 'my-dashboard' && <MyDashboard />}
        {activeTab === 'my-deals' && <MyDeals />}
        {activeTab === 'overrides' && <Overrides />}
        {activeTab === 'pre-apps' && <PreApplications />}
        {activeTab === 'admin' && canAdmin && <AdminPanel />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <Dashboard /> : <LoginScreen />;
}
