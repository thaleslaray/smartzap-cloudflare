import { expect, test } from "@playwright/test";

const remoteBaseUrl = process.env.QA_REMOTE_BASE_URL;
const isStaging = Boolean(
  remoteBaseUrl && new URL(remoteBaseUrl).hostname.includes("-staging."),
);

test.skip(
  !remoteBaseUrl || (!process.env.QA_READONLY_API_KEY && !process.env.QA_API_KEY),
  "Diagnóstico remoto exige Worker conhecido e credencial técnica de leitura.",
);

test("ambiente remoto apresenta o estado real da Meta sem erro falso", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/settings/health");
  expect(response.ok()).toBe(true);
  const health = await response.json();
  expect(health.metaConfigured).toBe(true);
  expect(health.meta).toBeTruthy();
  expect(health.meta.verificationStatus).not.toBe("credential_invalid");

  await page.goto("/settings/meta-diagnostics", {
    waitUntil: "domcontentloaded",
  });
  if (health.meta.verificationStatus === "complete") {
    expect(health).toMatchObject({
      webhookConfigured: true,
      meta: {
        tokenValid: true,
        tokenAppMatches: true,
        tokenRequiredScopesPresent: true,
        phoneBelongsToWaba: true,
        appWebhookMessagesSubscribed: true,
        appWebhookRequiredFieldsPresent: true,
      },
    });
    await expect(page.getByText("Token válido na Graph API.")).toBeVisible();
    await expect(page.getByText("Eventos messages assinados.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Atualizar assinaturas" })).toBeVisible();
    await expect(page.getByText("Verificação indisponível", { exact: true })).toHaveCount(0);
    if (isStaging) {
      // A Meta aceita um único callback efetivo por número/WABA. Em homologação
      // read-only ele deve continuar apontando para produção, sem que o staging
      // alegue conexão plena ou credencial inválida.
      expect(health).toMatchObject({
        metaLive: false,
        meta: { effectiveWebhookCallbackMatches: false },
      });
      await expect(
        page.getByRole("heading", { name: "Configuração requer atenção" }),
      ).toBeVisible();
      await expect(page.getByText("Callback ausente ou divergente.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Conectado" })).toHaveCount(0);
    } else {
      expect(health).toMatchObject({
        metaLive: true,
        meta: { effectiveWebhookCallbackMatches: true },
      });
      await expect(page.getByRole("heading", { name: "Conectado" })).toBeVisible();
      await expect(page.getByText("Callback efetivo corresponde ao Worker.")).toBeVisible();
    }
  } else {
    expect(health).toMatchObject({
      metaLive: false,
      webhookConfigured: false,
      meta: {
        verificationStatus: "unavailable",
        retryable: true,
        tokenValid: null,
        tokenAppMatches: null,
        tokenRequiredScopesPresent: null,
        phoneBelongsToWaba: null,
        effectiveWebhookCallbackMatches: null,
        appWebhookMessagesSubscribed: null,
        appWebhookRequiredFieldsPresent: null,
      },
    });
    await expect(page.getByRole("heading", { name: "Verificação indisponível" })).toBeVisible();
    await expect(page.getByText(/Nenhuma credencial foi declarada inválida/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Corrigir assinatura|Atualizar assinaturas/ })).toHaveCount(0);
  }
  await expect(page.getByText("Credencial rejeitada", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Token Meta inválido.", { exact: true })).toHaveCount(0);
});
