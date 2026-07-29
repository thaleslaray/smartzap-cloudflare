import { Hono } from "hono";
import { z } from "zod";
import {
  decryptFlowRequest,
  encryptFlowResponse,
  handleFlowRequest,
  isValidFlowSignature,
} from "../whatsapp/flow-endpoint";

const encryptedRequestSchema = z.object({
  // 10 MB de payload claro mais overhead de Base64/GCM.
  encrypted_flow_data: z.string().min(1).max(14_000_000),
  encrypted_aes_key: z.string().min(1).max(20_000),
  initial_vector: z.string().min(1).max(200),
});

export const flowEndpointRoutes = new Hono<{ Bindings: Env }>()
  .get("/", (c) =>
    c.json({
      status: c.env.FLOW_PRIVATE_KEY ? "ready" : "not_configured",
      signatureValidation: Boolean(c.env.META_APP_SECRET),
    }),
  )
  .post("/", async (c) => {
    if (!c.env.FLOW_PRIVATE_KEY)
      return c.json({ error: "endpoint não configurado" }, 503);
    const rawBody = await c.req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 15_000_000)
      return c.json({ error: "request acima do limite" }, 413);
    if (
      !(await isValidFlowSignature(
        rawBody,
        c.req.header("x-hub-signature-256"),
        c.env.META_APP_SECRET,
      ))
    )
      return new Response(null, { status: 432 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const encrypted = encryptedRequestSchema.safeParse(parsed);
    if (!encrypted.success) return c.json({ error: "request inválida" }, 400);
    let decrypted;
    try {
      decrypted = await decryptFlowRequest(
        encrypted.data,
        c.env.FLOW_PRIVATE_KEY,
      );
    } catch {
      // 421 instrui o cliente da Meta a atualizar a chave pública armazenada.
      return new Response(null, { status: 421 });
    }
    let response: Record<string, unknown>;
    const startedAt = Date.now();
    let success = true;
    let errorCode: string | null = null;
    try {
      response = await handleFlowRequest(c.env.DB, decrypted.body, c.env);
    } catch (error) {
      success = false;
      errorCode = error instanceof Error
        ? error.message.replace(/[^A-Za-z0-9_ -]/g, "").slice(0, 80)
        : "FLOW_ENDPOINT_ERROR";
      response = {
        screen: decrypted.body.screen || "SCREEN_A",
        data: { error_message: "Não foi possível continuar" },
      };
    }
    const latencyMs = Date.now() - startedAt;
    try {
      await c.env.DB.prepare(
        `INSERT INTO flow_endpoint_metrics(action,success,latency_ms,error_code)
         VALUES(?1,?2,?3,?4)`,
      ).bind(decrypted.body.action, success ? 1 : 0, latencyMs, errorCode).run();
    } catch {
      // Telemetria nunca pode impedir a resposta criptografada à Meta.
    }
    console.log(JSON.stringify({
      level: latencyMs >= 8_000 ? "warn" : "info",
      msg: "flow endpoint processado",
      action: decrypted.body.action,
      latencyMs,
      success,
    }));
    return c.text(
      await encryptFlowResponse(
        response,
        decrypted.aesKey,
        decrypted.initialVector,
      ),
    );
  });
