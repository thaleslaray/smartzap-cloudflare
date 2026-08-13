/**
 * Rotas estáticas pertencentes ao escopo produtivo autenticado.
 *
 * Este inventário é compartilhado pelos gates responsivo, WCAG e remoto para
 * impedir que uma rota nova seja homologada em apenas uma dessas camadas.
 * Rotas dinâmicas válidas ficam separadas porque dependem de fixtures.
 */
export const authenticatedOperationalRoutes = [
  "/",
  "/campaigns",
  "/campaigns/new",
  "/contacts",
  "/segments",
  "/inbox",
  "/knowledge",
  "/templates",
  "/flows",
  "/forms",
  "/flows/builder",
  "/templates/drafts/new",
  "/templates/new",
  "/submissions",
  "/templates/projects",
  "/templates/projects/new",
  "/settings",
  "/setup",
  "/settings/attendants",
  "/settings/meta-diagnostics",
  "/settings/performance",
  "/settings/ai",
  "/settings/ai/agents",
  "/analytics/conversions",
] as const;

/** Rotas públicas estáticas que não podem exigir sessão. */
export const publicStaticRoutes = [
  "/privacy",
  "/data-deletion",
] as const;

/** Instalador público, com contrato próprio e sem conteúdo jurídico obrigatório. */
export const publicInstallerRoutes = ["/install"] as const;

/** Rotas dinâmicas que existem no seed determinístico do Playwright. */
export const seededDynamicRoutes = [
  "/campaigns/e2e-campaign-control",
  "/inbox/22222222-2222-4222-8222-222222222222",
] as const;

/** Padrões dinâmicos montados no React Router e cobertos por fixture válida. */
export const coveredDynamicRoutePatterns = [
  "/campaigns/:id",
  "/inbox/:id",
  "/templates/drafts/:id",
  "/templates/:id",
  "/flows/builder/:id",
  "/templates/projects/:id",
  "/f/:slug",
  "/atendimento/conversa/:id",
] as const;

/** Superfícies negativas que precisam falhar de forma explícita e acessível. */
export const retiredAndFallbackRoutes = [
  "/workflows/qualquer-coisa",
  "/design-preview",
  "/rota-que-nao-existe",
] as const;
