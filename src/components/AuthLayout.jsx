import React from "react";
import { Link } from "react-router-dom";
import { safeReturnTo } from "@/lib/authReturnTo";

// Dark theme scoped to the auth screens only: overriding these CSS variables here
// re-colors every shadcn Button/Input/Label inside without touching the rest of the app.
const THEME = {
  "--background": "240 10% 4%",
  "--foreground": "0 0% 98%",
  "--card": "240 8% 8%",
  "--card-foreground": "0 0% 98%",
  "--primary": "217 91% 60%",
  "--primary-foreground": "0 0% 100%",
  "--muted": "240 6% 14%",
  "--muted-foreground": "240 5% 66%",
  "--accent": "240 6% 14%",
  "--accent-foreground": "0 0% 98%",
  "--border": "240 6% 20%",
  "--input": "240 6% 22%",
  "--ring": "217 91% 60%",
  "--destructive": "0 84% 62%",
};

function Tabs({ active }) {
  const returnTo = safeReturnTo();
  const suffix = returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "";
  const items = [
    ["login", "Log in", "/login"],
    ["register", "Create account", "/register"],
  ];
  return (
    <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-full bg-white/5 border border-white/10">
      {items.map(([key, label, path]) => (
        <Link
          key={key}
          to={path + suffix}
          className={
            "text-center text-sm font-medium py-2 rounded-full transition " +
            (active === key
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export default function AuthLayout({ icon: Icon, title, subtitle, footer, tab, children }) {
  return (
    <div
      style={THEME}
      className="relative min-h-screen overflow-hidden bg-background text-foreground flex items-center justify-center px-4 py-10"
    >
      {/* soft blue glow behind everything */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-48 left-1/2 -translate-x-1/2 h-[560px] w-[560px] rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle, hsl(217 91% 60% / 0.55) 0%, hsl(224 76% 40% / 0.25) 45%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-56 -right-32 h-[440px] w-[440px] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, hsl(210 100% 70% / 0.45), transparent 70%)" }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-6 h-20 w-20 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 50% 30%, hsl(210 100% 82%) 0%, hsl(217 91% 60%) 42%, hsl(224 76% 30%) 100%)",
              boxShadow: "0 0 60px hsl(217 91% 60% / 0.5), inset 0 0 20px hsl(0 0% 100% / 0.25)",
            }}
          >
            {Icon && <Icon className="w-8 h-8 text-white" aria-hidden="true" />}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 sm:p-8 shadow-2xl [&_input]:rounded-xl [&_input]:bg-white/5 [&_input]:border-white/10 [&_button]:rounded-xl">
          {tab && <Tabs active={tab} />}
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
