import { Hono } from "hono";

/**
 * Workflow foi retirado do produto. Mantemos uma resposta explícita para não
 * deixar clientes antigos interpretarem um 404 genérico como falha temporária.
 * As tabelas históricas permanecem intactas para preservação dos dados.
 */
export const workflowsRetiredRoutes = new Hono<{ Bindings: Env }>().all(
  "*",
  (c) => c.json({ error: "workflows descontinuados nesta versão", code: "WORKFLOWS_RETIRED" }, 410),
);
