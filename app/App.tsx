import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { lazy, Suspense } from "react";
import Shell from "./components/Shell";
import { useRealtime } from "./hooks/useRealtime";

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
const Inbox = lazy(() => import("./pages/Inbox"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Segments = lazy(() => import("./pages/Segments"));
const Forms = lazy(() => import("./pages/Forms"));
const FlowBuilderHome = lazy(() => import("./pages/FlowBuilderHome"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DesignPreview = lazy(() => import("./pages/DesignPreview"));

const loading = <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--ds-text-muted)]">Carregando…</div>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AuthedApp() {
  useRealtime(); // WS de invalidação — Task 17
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
        <Route path="settings/attendants" element={<Attendants />} />
        <Route path="settings/meta-diagnostics" element={<MetaDiagnostics />} />
        <Route path="settings/performance" element={<Performance />} />
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
          <Route path="/f/:slug" element={<PublicForm />} />
          <Route path="/atendimento" element={<AttendantPortal />} />
          <Route
            path="/atendimento/conversa/:id"
            element={<AttendantPortal />}
          />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/*" element={<AuthedApp />} />
        </Routes></Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
