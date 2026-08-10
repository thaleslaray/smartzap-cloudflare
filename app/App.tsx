import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { lazy, Suspense } from "react";
import Shell from "./components/Shell";
import { useRealtime } from "./hooks/useRealtime";
import { api } from "./lib/api";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignNew = lazy(() => import("./pages/CampaignNew"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateDraft = lazy(() => import("./pages/TemplateDraft"));
const PublicForm = lazy(() => import("./pages/PublicForm"));
const Submissions = lazy(() => import("./pages/Submissions"));
const FlowBuilder = lazy(() => import("./pages/FlowBuilder"));
const TemplateProject = lazy(() => import("./pages/TemplateProject"));
const TemplateProjectNew = lazy(() => import("./pages/TemplateProjectNew"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AICenter = lazy(() => import("./pages/AICenter"));
const AIAgents = lazy(() => import("./pages/AIAgents"));
const Attendants = lazy(() => import("./pages/Attendants"));
const AttendantPortal = lazy(() => import("./pages/AttendantPortal"));
const MetaDiagnostics = lazy(() => import("./pages/MetaDiagnostics"));
const Performance = lazy(() => import("./pages/Performance"));
const ConversionsAnalytics = lazy(() => import("./pages/ConversionsAnalytics"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Segments = lazy(() => import("./pages/Segments"));
const Forms = lazy(() => import("./pages/Forms"));
const FlowBuilderHome = lazy(() => import("./pages/FlowBuilderHome"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Legal = lazy(() => import("./pages/Legal"));
const Installer = lazy(() => import("./pages/Installer"));
const Setup = lazy(() => import("./pages/Setup"));

const loading = <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--ds-text-muted)]">Carregando…</div>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AuthedApp() {
  useRealtime(); // WS de invalidação — Task 17
  const location = useLocation();
  const setupGate = useQuery({
    queryKey: ["setup-gate"],
    queryFn: () => api<{ required: boolean; complete: boolean }>("/api/setup/status"),
    staleTime: 10_000,
  });
  if (setupGate.isLoading) return loading;
  if (setupGate.isError)
    return <div className="flex min-h-screen items-center justify-center px-6 text-center text-sm text-red-300">Não foi possível verificar a instalação. Recarregue a página ou confira as migrações do D1.</div>;
  if (setupGate.data?.required && !setupGate.data.complete && location.pathname !== "/setup")
    return <Navigate to="/setup" replace />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignNew />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="segments" element={<Segments />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="inbox/:id" element={<Inbox />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="templates" element={<Templates />} />
        {/* Preserve the legacy information architecture while sharing the migrated modules. */}
        <Route
          path="flows"
          element={<Navigate to="/templates?tab=flows" replace />}
        />
        <Route path="forms" element={<Forms />} />
        <Route path="flows/builder" element={<FlowBuilderHome />} />
        <Route path="templates/drafts/new" element={<TemplateDraft />} />
        <Route path="templates/drafts/:id" element={<TemplateDraft />} />
        <Route path="templates/new" element={<TemplateProjectNew />} />
        <Route path="templates/:id" element={<TemplateProject />} />
        <Route path="submissions" element={<Submissions />} />
        <Route path="flows/builder/:id" element={<FlowBuilder />} />
        <Route
          path="templates/projects"
          element={<Navigate to="/templates?tab=projects" replace />}
        />
        <Route path="templates/projects/:id" element={<TemplateProject />} />
        <Route path="templates/projects/new" element={<TemplateProjectNew />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="setup" element={<Setup />} />
        <Route path="settings/attendants" element={<Attendants />} />
        <Route path="settings/meta-diagnostics" element={<MetaDiagnostics />} />
        <Route path="settings/performance" element={<Performance />} />
        <Route path="analytics/conversions" element={<ConversionsAnalytics />} />
        <Route path="settings/ai" element={<AICenter />} />
        <Route path="settings/ai/agents" element={<AIAgents />} />
        <Route path="workflows/*" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={loading}><Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/install" element={<Installer />} />
          <Route path="/privacy" element={<Legal />} />
          <Route path="/data-deletion" element={<Legal />} />
          <Route path="/f/:slug" element={<PublicForm />} />
          <Route path="/atendimento" element={<AttendantPortal />} />
          <Route
            path="/atendimento/conversa/:id"
            element={<AttendantPortal />}
          />
          <Route path="/*" element={<AuthedApp />} />
        </Routes></Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
