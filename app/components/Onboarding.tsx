import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Rocket, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { focusRing } from "./ui";

type Health = {
  databaseOk: boolean;
  metaConfigured: boolean;
  metaLive: boolean;
  templatesConfigured: boolean;
  approvedTemplates: number;
  webhookConfigured: boolean;
};

const DISMISSED_KEY = "smartzap_onboarding_dismissed_v1";

export default function Onboarding() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "true",
  );
  const health = useQuery({
    queryKey: ["settings-health"],
    queryFn: () => api<Health>("/api/settings/health"),
    retry: false,
  });
  const data = health.data;
  const isOnboardingSurface = pathname === "/" || pathname.startsWith("/settings");
  if (dismissed || !isOnboardingSurface || !data || (data.metaConfigured && data.metaLive && data.templatesConfigured && data.webhookConfigured)) return null;

  const steps = [
    { label: "Conectar número e WABA", done: data.metaConfigured, to: "/settings" },
    { label: "Validar acesso à Meta", done: data.metaLive, to: "/settings/meta-diagnostics" },
    { label: "Confirmar webhook", done: data.webhookConfigured, to: "/settings/meta-diagnostics" },
    { label: `Sincronizar templates${data.approvedTemplates ? ` (${data.approvedTemplates})` : ""}`, done: data.templatesConfigured, to: "/templates" },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <aside className="fixed bottom-2 left-2 right-2 z-40 max-h-[45dvh] w-auto overflow-y-auto rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:max-h-none sm:w-[min(380px,calc(100vw-2.5rem))] sm:overflow-visible sm:p-5" aria-label="Configuração inicial">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-400"><Rocket size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Prepare o SmartZap</p>
          <p className="mt-1 text-sm text-[var(--ds-text-secondary)]">{completed} de {steps.length} etapas concluídas</p>
        </div>
        <button type="button" aria-label="Fechar configuração inicial" onClick={() => { localStorage.setItem(DISMISSED_KEY, "true"); setDismissed(true); }} className={`rounded-md p-1 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] ${focusRing}`}><X size={18} /></button>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--ds-bg-hover)]"><div className="h-full rounded-full bg-primary-500 transition-[width]" style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
      <div className="mt-4 space-y-1">
        {steps.map((step) => (
          <button key={step.label} type="button" onClick={() => navigate(step.to)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--ds-bg-hover)] ${focusRing}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step.done ? "border-primary-500 bg-primary-500/15 text-primary-400" : "border-[var(--ds-border-default)] text-[var(--ds-text-muted)]"}`}>{step.done ? <Check size={14} /> : null}</span>
            <span className="flex-1">{step.label}</span><ChevronRight size={16} className="text-[var(--ds-text-muted)]" />
          </button>
        ))}
      </div>
    </aside>
  );
}
