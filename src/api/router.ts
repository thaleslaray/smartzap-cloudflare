import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { authRoutes } from "./auth";
import { contactsRoutes } from "./contacts";
import { templatesRoutes } from "./templates";
import { settingsRoutes } from "./settings";
import { realtimeRoutes } from "./realtime";
import { campaignsRoutes } from "./campaigns";
import { webhookRoutes } from "./webhook";
import { dashboardRoutes } from "./dashboard";
import { conversationsRoutes } from "./conversations";
import { attendantsRoutes } from "./attendants";
import { segmentsRoutes } from "./segments";
import { knowledgeRoutes } from "./knowledge";
import { agentsRoutes } from "./agents";
import { workflowsRetiredRoutes } from "./workflows-retired";
import { attendantPortalRoutes } from "./attendant-portal";
import {
  flowsRoutes,
  formsRoutes,
  publicFormsRoutes,
  submissionsRoutes,
  templateProjectsRoutes,
} from "./automation-assets";
import { requireSameOriginForMutation } from "./origin";
import { securityHeaders } from "../middleware/security";
import { redactOperationalDetail } from "../domain/redaction";
import { flowEndpointRoutes } from "./flow-endpoint";
import { googleCalendarPublicRoutes, googleCalendarRoutes } from "./google-calendar";
import { pricingRoutes } from "./pricing";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", securityHeaders);
  // Handler global de erro: log JSON estruturado + resposta genérica (sem vazar stack)
  app.onError((err, c) => {
    const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
    console.error(
      JSON.stringify({
        level: "error",
        path: new URL(c.req.url).pathname,
        method: c.req.method,
        requestId,
        errorType: err.name,
        message: redactOperationalDetail(err.message),
      }),
    );
    c.header("x-request-id", requestId);
    return c.json({ error: "erro interno" }, 500);
  });
  // Formulários públicos precisam chegar ao Worker antes da guarda geral de /api.
  // A submissão valida tamanho e schema no próprio handler.
  app.route("/api/public/forms", publicFormsRoutes);
  app.route("/api/attendant", attendantPortalRoutes);
  // Endpoint da Meta para Flows dinâmicos: público, assinado e criptografado.
  app.route("/api/flows/endpoint", flowEndpointRoutes);
  app.route("/api/integrations/google-calendar", googleCalendarPublicRoutes);
  app.use("/api/*", requireAuth);
  app.use("/api/*", requireSameOriginForMutation);
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes);
  app.route("/api/contacts", contactsRoutes);
  app.route("/api/templates", templatesRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/google-calendar", googleCalendarRoutes);
  app.route("/api/realtime", realtimeRoutes);
  app.route("/api/campaigns", campaignsRoutes);
  app.route("/api/pricing", pricingRoutes);
  app.route("/api/dashboard", dashboardRoutes);
  app.route("/api/conversations", conversationsRoutes);
  app.route("/api/attendants", attendantsRoutes);
  app.route("/api/segments", segmentsRoutes);
  app.route("/api/knowledge", knowledgeRoutes);
  app.route("/api/agents", agentsRoutes);
  app.route("/api/workflows", workflowsRetiredRoutes);
  app.route("/api/flows", flowsRoutes);
  app.route("/api/forms", formsRoutes);
  app.route("/api/template-projects", templateProjectsRoutes);
  app.route("/api/submissions", submissionsRoutes);
  // Webhook da Meta: público (fora de /api/*), autenticado por assinatura HMAC
  app.route("/webhook", webhookRoutes);
  return app;
}
