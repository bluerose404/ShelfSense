import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, TrendingUp, Boxes, ShoppingCart, 
  ChefHat, Trash2, Users, Settings as SettingsIcon,
  Clock, Globe
} from 'lucide-react';
import ForecastView from './components/ForecastView';

export default function App() {
  const { t, i18n } = useTranslation();
  const [currentTab, setCurrentTab] = useState('forecast');
  const [demoClock] = useState('2026-11-04 09:00 (수/Wed)');
  const [healthStatus, setHealthStatus] = useState<string>('connecting...');

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data.status === 'ok' ? 'Online' : 'Degraded'))
      .catch(() => setHealthStatus('API Offline'));
  }, []);

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('ko') ? 'en' : 'ko';
    i18n.changeLanguage(nextLng);
  };

  const navItems = [
    { id: 'summary', label: t('nav.summary'), icon: LayoutDashboard },
    { id: 'forecast', label: t('nav.forecast'), icon: TrendingUp },
    { id: 'stock', label: t('nav.stock'), icon: Boxes },
    { id: 'orders', label: t('nav.orders'), icon: ShoppingCart },
    { id: 'prep', label: t('nav.prep'), icon: ChefHat },
    { id: 'waste', label: t('nav.waste'), icon: Trash2 },
    { id: 'labor', label: t('nav.labor'), icon: Users },
    { id: 'settings', label: t('nav.settings'), icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A202C] flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#078B79] flex items-center justify-center text-white font-bold text-xl shadow-sm">
              S
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-gray-900 tracking-tight">ShelfSense</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300">
                  {t('demo_data_badge')}
                </span>
              </div>
              <p className="text-xs text-gray-500 hidden sm:block">
                {t('demo_data_subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Demo Clock Indicator */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
              <Clock className="w-3.5 h-3.5 text-teal-700" />
              <span>{demoClock}</span>
            </div>

            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-semibold transition"
              title="Toggle English / 한국어"
            >
              <Globe className="w-4 h-4 text-gray-600" />
              <span>{i18n.language.startsWith('ko') ? 'ENG' : '한국어'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar Navigation */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation Bar */}
        <aside className="w-full md:w-60 bg-white border-r border-gray-200 p-3 md:py-6 flex md:flex-col overflow-x-auto space-x-1 md:space-x-0 md:space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  active 
                    ? 'bg-[#078B79] text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-gray-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6">
          {currentTab === 'forecast' ? (
            <ForecastView />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {navItems.find(i => i.id === currentTab)?.label}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Backend Status: <span className="font-semibold text-teal-700">{healthStatus}</span>
              </p>

              <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 text-sm flex items-start space-x-3">
                <div className="p-1 bg-[#078B79] rounded text-white">✓</div>
                <div>
                  <p className="font-semibold">{navItems.find(i => i.id === currentTab)?.label}</p>
                  <p className="text-xs text-teal-800 mt-0.5">
                    Module ready for subsequent milestones.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
