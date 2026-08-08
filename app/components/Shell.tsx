import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { Logo, focusRing } from "./ui";
import Onboarding from "./Onboarding";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campanhas", icon: MessageSquare },
  { to: "/inbox", label: "Inbox", icon: MessageCircle },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/contacts", label: "Contatos", icon: Users },
  { to: "/settings/ai", label: "IA", icon: Sparkles },
  { to: "/settings", label: "Configurações", icon: Settings },
];

const pageTitle = (pathname: string) => {
  if (pathname.startsWith("/templates/projects/"))
    return "Projeto de Templates";
  if (pathname.startsWith("/campaigns/new")) return "Nova Campanha";
  if (pathname.startsWith("/campaigns/")) return "Detalhes da campanha";
  if (pathname.startsWith("/campaigns")) return "Campanhas";
  if (pathname.startsWith("/inbox")) return "Inbox";
  if (pathname.startsWith("/analytics/conversions")) return "Conversões de anúncios";
  if (pathname.startsWith("/templates")) return "Templates";
  if (pathname.startsWith("/forms")) return "App";
  if (pathname.startsWith("/contacts")) return "Contatos";
  if (pathname.startsWith("/segments")) return "Segmentos";
  if (pathname.startsWith("/knowledge")) return "Base de conhecimento";
  if (pathname.startsWith("/submissions")) return "Submissões";
  if (pathname === "/flows/builder") return "MiniApp Builder";
  if (pathname.startsWith("/flows/builder")) return "Editor de MiniApp";
  if (pathname.startsWith("/settings/ai/agents")) return "Agentes IA";
  if (pathname.startsWith("/settings/ai")) return "Central de IA";
  if (pathname.startsWith("/settings")) return "Configurações";
  return "Dashboard";
};

export default function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  // A direção premium privilegia a navegação persistente no desktop. O menu
  // continua recolhível para quem precisa de mais área de trabalho.
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    localStorage.getItem("smartzap_theme") === "light" ? "light" : "dark",
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isInbox = pathname.startsWith("/inbox");
  const isContacts = pathname.startsWith("/contacts");
  const isDashboard = pathname === "/";
  const isFullHeightContent = isInbox || isContacts;
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mobileMenu = useRef<HTMLElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("smartzap_theme", theme);
  }, [theme]);
  // Guarda de rota: em navegação direta sem sessão, esta query recebe 401 e o
  // próprio api() redireciona para /login; throwOnError evita error boundary
  useQuery({
    queryKey: ["auth-status"],
    queryFn: () => api<{ authenticated: boolean }>("/api/auth/status"),
    throwOnError: false,
    retry: false,
  });
  const health = useQuery({
    queryKey: ["settings-health"],
    queryFn: () =>
      api<{ readyForPilot: boolean; metaConfigured: boolean }>(
        "/api/settings/health",
      ),
    retry: false,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const background = [
      document.querySelector("main"),
      openButton.current?.closest("header"),
    ].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    const inertState = background.map((element) =>
      element.hasAttribute("inert"),
    );
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    document.body.style.overflow = "hidden";
    background.forEach((element) => element.setAttribute("inert", ""));
    requestAnimationFrame(() => closeButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileMenu.current) return;

      const focusable = [
        ...mobileMenu.current.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        mobileMenu.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !mobileMenu.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !mobileMenu.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => {
        if (!inertState[index]) element.removeAttribute("inert");
      });
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => openButton.current?.focus());
    };
  }, [menuOpen]);

  const healthIndicator = (
    <div className="mt-auto flex items-center gap-2 border-t border-border-subtle p-2.5">
      <span
        className={`h-[7px] w-[7px] rounded-full ${
          health.data?.readyForPilot
            ? "bg-primary-400"
            : health.data?.metaConfigured
              ? "bg-status-skipped"
              : "bg-status-failed"
        }`}
      />
      <span className="text-xs text-zinc-400">
        {health.isLoading
          ? "Verificando operação…"
          : health.data?.readyForPilot
            ? "Operação pronta"
            : health.data?.metaConfigured
              ? "Envios protegidos"
              : "Meta não configurada"}
      </span>
    </div>
  );

  const issueCount = health.data
    ? Number(!health.data.metaConfigured) + Number(!health.data.readyForPilot)
    : 0;

  const topControls = (mobile = false) => (
    <>
      {!mobile || !pathname.startsWith("/inbox") ? (
        <button type="button" onClick={() => setHelpOpen(true)} aria-label="Abrir ajuda" className={`flex h-11 w-11 items-center justify-center rounded-full border border-transparent hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] ${focusRing}`}><HelpCircle size={mobile ? 20 : 17} /></button>
      ) : null}
      <button type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} aria-label={`Alternar para tema ${theme === "dark" ? "claro" : "escuro"}`} className={`flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] ${focusRing}`}>{theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}</button>
      {!mobile || !pathname.startsWith("/inbox") ? (
        <button type="button" onClick={() => setAlertsOpen(true)} aria-label={`Alertas operacionais${issueCount ? ` (${issueCount})` : ""}`} className={`relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--ds-bg-hover)] ${focusRing}`}><Bell size={mobile ? 20 : 17} />{issueCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-status-failed" />}</button>
      ) : null}
    </>
  );

  const navigation = (onNavigate?: () => void, compact = false) => (
    <nav
      className={`flex flex-col ${compact ? "gap-1.5" : "gap-0"}`}
      aria-label="Navegação principal"
    >
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/" || to === "/campaigns" || to === "/settings"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `${
              compact
                ? "relative flex h-9 w-9 items-center justify-center rounded-lg"
                : "mb-1 flex items-center gap-3 rounded-xl px-4 py-3"
            } transition-all duration-200 ${focusRing} ${
              isActive
                ? "border border-primary-500/20 bg-primary-500/10 font-medium text-primary-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                : `${compact ? "border border-transparent " : ""}text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]`
            }`
          }
          title={compact ? label : undefined}
        >
          <Icon aria-hidden="true" size={compact ? 16 : 20} />
          {!compact && <span className="flex items-center gap-2">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="legacy-app min-h-[100dvh] bg-zinc-950 lg:flex lg:h-[100dvh] lg:overflow-hidden">
      <header
        className={`premium-topbar sticky top-0 z-30 flex shrink-0 items-center justify-between border-b lg:hidden ${pathname.startsWith("/inbox") ? "h-14 px-3" : "h-20 px-5 sm:px-6"}`}
      >
        <div className="flex items-center">
          <button
            ref={openButton}
            type="button"
            aria-label="Abrir menu de navegação"
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className={`${pathname.startsWith("/inbox") ? "mr-1" : "mr-3"} flex h-11 w-11 items-center justify-center rounded-full text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] ${focusRing}`}
          >
            <Menu
              aria-hidden="true"
              size={pathname.startsWith("/inbox") ? 18 : 24}
            />
          </button>
          {pathname.startsWith("/inbox") && (
            <span className="text-sm text-[var(--ds-text-secondary)]">
              Inbox
            </span>
          )}
          <nav
            className="hidden items-center text-sm text-[var(--ds-text-muted)] md:flex"
            aria-label="Breadcrumb"
          >
            <span>App</span>
            <span className="mx-2">/</span>
            <span className="text-[var(--ds-text-secondary)]">
              {pageTitle(pathname)}
            </span>
          </nav>
        </div>
        <div
          className={`flex items-center text-[var(--ds-text-muted)] ${pathname.startsWith("/inbox") ? "gap-4" : "gap-3"}`}
        >
          {topControls(true)}
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            ref={mobileMenu}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            tabIndex={-1}
            className="premium-sidebar absolute inset-y-0 left-0 flex w-64 flex-col border-r border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between px-2.5 pb-5 pt-1.5">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="text-subtitle font-bold">SmartZap</span>
              </div>
              <button
                ref={closeButton}
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMenuOpen(false)}
                className={`rounded-full p-2 text-zinc-400 hover:bg-zinc-800 ${focusRing}`}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <NavLink
              to="/campaigns/new"
              onClick={() => setMenuOpen(false)}
              className={`legacy-primary-action mx-2 mb-5 inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg border px-4 text-sm font-semibold ${focusRing}`}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Nova Campanha</span>
            </NavLink>
            {navigation(() => setMenuOpen(false))}
            {healthIndicator}
          </aside>
        </div>
      )}

      <aside
        className={`premium-sidebar hidden shrink-0 flex-col border-r border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] transition-[width] duration-200 lg:flex ${sidebarExpanded ? "w-64 p-4" : "w-14 items-center py-3"}`}
      >
        {sidebarExpanded ? (
          <>
            <div className="mb-6 flex h-16 items-center px-2">
              <div className="mr-3">
                <Logo size={40} />
              </div>
              <span className="flex-1 text-xl font-bold tracking-tight text-[var(--ds-text-primary)]">
                SmartZap
              </span>
              <button
                type="button"
                aria-label="Recolher menu de navegação"
                onClick={() => setSidebarExpanded(false)}
                className={`flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] ${focusRing}`}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
            </div>
            <nav
              className="flex-1 space-y-6 overflow-y-auto"
              aria-label="Menu principal"
            >
              <div>
                <NavLink
                  to="/campaigns/new"
                  className={`legacy-primary-action mx-2 inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg border px-4 text-sm font-semibold ${focusRing}`}
                >
                  <Plus
                    size={16}
                    aria-hidden="true"
                  />
                  <span>Nova Campanha</span>
                </NavLink>
              </div>
              <div className="space-y-1 px-2">
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Menu
                </p>
                {navigation()}
              </div>
            </nav>
            <div className="mt-auto border-t border-[var(--ds-border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-bg-hover)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-lg font-bold text-primary-400">
                  S
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    SmartZap
                  </span>
                  <span className="block truncate text-xs text-[var(--ds-text-muted)]">
                    Administrador
                  </span>
                </span>
                <LogOut
                  size={16}
                  className="text-[var(--ds-text-muted)]"
                  aria-hidden="true"
                />
              </button>
              <div className="mt-2 text-center font-mono text-[10px] text-[var(--ds-text-muted)]">
                v1.0.0
              </div>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Expandir menu"
              onClick={() => setSidebarExpanded(true)}
              className={`mb-3 rounded-md border border-zinc-700 p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
            >
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <div className="mb-4">
              <Logo size={36} />
            </div>
            {navigation(undefined, true)}
            <div
              className="mt-auto"
              title={
                health.data?.readyForPilot
                  ? "Operação pronta"
                  : "Operação requer atenção"
              }
            >
              <span
                className={`block h-2 w-2 rounded-full ${health.data?.readyForPilot ? "bg-primary-400" : health.data?.metaConfigured ? "bg-status-skipped" : "bg-status-failed"}`}
              />
            </div>
          </>
        )}
      </aside>
      <div
        className={`min-w-0 lg:h-[100dvh] lg:flex-1 ${isInbox ? "h-[calc(100dvh-3rem)] overflow-hidden lg:h-[100dvh]" : isContacts ? "flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden lg:h-[100dvh]" : "flex min-h-[100dvh] flex-col lg:min-h-0 lg:overflow-hidden"}`}
      >
        {!isInbox && (
          <header className="premium-topbar hidden h-20 shrink-0 items-center justify-between border-b px-8 lg:flex xl:px-12">
            <nav
              className="flex items-center text-sm text-zinc-500"
              aria-label="Breadcrumb"
            >
              <span>App</span>
              <span className="mx-2 text-zinc-700">/</span>
              <span className="text-zinc-400">{pageTitle(pathname)}</span>
            </nav>
            <div className="flex items-center gap-3 text-[var(--ds-text-muted)]">
              {topControls()}
            </div>
          </header>
        )}
        <main
          className={
            isInbox
              ? "h-full"
              : `flex-1 px-6 pb-8 pt-6 lg:p-10 ${isFullHeightContent ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"}`
          }
        >
          <div
            className={
              isInbox
                ? "h-full"
              : `mx-auto w-full ${isDashboard ? "max-w-none" : isContacts ? "max-w-7xl 2xl:max-w-[1440px]" : "max-w-[1280px]"} ${isFullHeightContent ? "min-h-0 flex-1" : ""}`
            }
          >
            <Outlet />
          </div>
        </main>
      </div>
      <Onboarding />
      {(helpOpen || alertsOpen) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) { setHelpOpen(false); setAlertsOpen(false); } }}>
          <section role="dialog" aria-modal="true" aria-label={helpOpen ? "Ajuda do SmartZap" : "Alertas operacionais"} className="premium-card w-full max-w-lg rounded-[24px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{helpOpen ? "Como começar" : "Alertas operacionais"}</h2><p className="mt-1 text-sm text-[var(--ds-text-secondary)]">{helpOpen ? "Atalhos para configurar e validar a operação." : issueCount ? "Há itens que precisam da sua atenção." : "Nenhuma pendência detectada agora."}</p></div><button type="button" aria-label="Fechar" onClick={() => { setHelpOpen(false); setAlertsOpen(false); }} className={`rounded-md p-2 ${focusRing}`}><X size={18} /></button></div>
            <div className="mt-5 space-y-2">
              {(helpOpen ? [
                ["Configurar número e credenciais", "/settings"],
                ["Validar conexão, webhook e permissões", "/settings/meta-diagnostics"],
                ["Sincronizar e conferir templates", "/templates"],
                ["Acompanhar capacidade e performance", "/settings/performance"],
              ] : [
                ...(!health.data?.metaConfigured ? [["Credenciais Meta não configuradas", "/settings"]] : []),
                ...(!health.data?.readyForPilot ? [["Operação requer diagnóstico", "/settings/meta-diagnostics"]] : []),
              ]).map(([label, to]) => <button key={to} type="button" onClick={() => { setHelpOpen(false); setAlertsOpen(false); navigate(to); }} className={`flex w-full items-center justify-between rounded-xl border border-[var(--ds-border-subtle)] px-4 py-3 text-left hover:bg-[var(--ds-bg-hover)] ${focusRing}`}><span>{label}</span><ChevronRight size={18} /></button>)}
              {!helpOpen && issueCount === 0 && (
                <div className="rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-300">
                  Credenciais Meta e operação estão prontas. Nenhuma ação necessária.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
