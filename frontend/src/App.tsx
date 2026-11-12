import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, TrendingUp, Boxes, ShoppingCart,
  ChefHat, Trash2, Users, Settings as SettingsIcon,
  Clock, Languages, FlaskConical
} from 'lucide-react';
import ForecastView from './components/ForecastView';
import InventoryScanView from './components/InventoryScanView';
import OrdersView from './components/OrdersView';
import PrepSheetView from './components/PrepSheetView';
import WasteView from './components/WasteView';
import LaborView from './components/LaborView';
import SummaryView from './components/SummaryView';
import SettingsAuditView from './components/SettingsAuditView';

export default function App() {
  const { t, i18n } = useTranslation();
  const [currentTab, setCurrentTab] = useState('summary');
  const isKo = i18n.language.startsWith('ko');
  const demoClock = isKo ? '2026-11-04 (수) 09:00' : 'Wed 4 Nov 2026, 09:00';

  useEffect(() => {
    document.documentElement.lang = isKo ? 'ko' : 'en';
  }, [isKo]);

  const toggleLanguage = () => {
    i18n.changeLanguage(isKo ? 'en' : 'ko');
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
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Header: logo always sits on paper (DESIGN.md §10) */}
      <header className="bg-paper sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="" className="h-10 w-auto shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[21px] font-bold leading-none">{t('app_name')}</span>
                <span className="ss-chip ss-chip-info" data-testid="demo-badge">
                  <FlaskConical aria-hidden="true" />
                  {t('demo_data_badge')}
                </span>
              </div>
              <p className="ss-meta hidden sm:block truncate mt-1">{t('demo_data_subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-sm" title={t('demo_clock')}>
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span className="tabular-nums">{demoClock}</span>
            </div>
            <button
              onClick={toggleLanguage}
              className="ss-btn ss-btn-secondary ss-btn-sm"
              title="English / 한국어"
            >
              <Languages className="w-4 h-4" aria-hidden="true" />
              <span>{isKo ? 'English' : '한국어'}</span>
            </button>
          </div>
        </div>
        {/* The shelf rail — signature structural element */}
        <div className="ss-rail" />
      </header>

      <div className="flex-1 max-w-[1200px] w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation */}
        <nav
          aria-label="Main"
          className="w-full md:w-[232px] shrink-0 md:border-r md:border-ink/15 px-3 py-3 md:py-6 flex md:flex-col overflow-x-auto gap-1 border-b border-ink/15 md:border-b-0"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 min-h-[44px] md:min-h-[40px] text-sm whitespace-nowrap text-left transition-colors ${
                  active
                    ? 'bg-ink text-paper font-bold shadow-[inset_4px_0_0_var(--color-signal)]'
                    : 'text-ink/70 hover:text-ink hover:bg-ink/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 p-4 md:p-8">
          {currentTab === 'summary' ? (
            <SummaryView onNavigate={tab => setCurrentTab(tab)} />
          ) : currentTab === 'forecast' ? (
            <ForecastView />
          ) : currentTab === 'stock' ? (
            <InventoryScanView />
          ) : currentTab === 'orders' ? (
            <OrdersView />
          ) : currentTab === 'prep' ? (
            <PrepSheetView />
          ) : currentTab === 'waste' ? (
            <WasteView />
          ) : currentTab === 'labor' ? (
            <LaborView />
          ) : (
            <SettingsAuditView />
          )}
        </main>
      </div>
    </div>
  );
}
