import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Dumbbell, Salad, BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/workout', label: 'Train', icon: Dumbbell },
  { to: '/nutrition', label: 'Fuel', icon: Salad },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/coach', label: 'Coach', icon: Sparkles },
];

export default function Layout() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith('/workout/active');

  return (
    <div className="relative min-h-screen bg-background flex flex-col overflow-x-hidden">
      {/* Atmospheric aura: soft blue light bleeding into the void behind every page */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.20) 0%, rgba(9,11,16,0) 70%)' }}
        />
        <div
          className="absolute -bottom-48 -right-32 h-[420px] w-[420px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(9,11,16,0) 70%)' }}
        />
      </div>

      <main className={cn('relative flex-1 w-full max-w-md mx-auto px-4 pt-5', hideNav ? 'pb-4' : 'pb-32')}>
        <Outlet />
      </main>

      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 z-50 safe-bottom">
          <div className="max-w-md mx-auto px-3 pb-2">
            <div
              className="glass rounded-full flex items-center justify-around h-[68px] px-2"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 40px -15px rgba(37,99,235,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) =>
                      cn(
                        'relative flex flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 transition-all flex-1',
                        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')}
                          style={isActive ? { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.7))' } : undefined}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span className="text-[10px] font-semibold tracking-[0.04em]">{t.label}</span>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary"
                            style={{ boxShadow: '0 0 8px 2px rgba(59,130,246,0.8)' }}
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
