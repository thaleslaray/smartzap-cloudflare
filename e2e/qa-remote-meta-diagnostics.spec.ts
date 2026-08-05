import { expect, test } from "@playwright/test";

const remoteBaseUrl = process.env.QA_REMOTE_BASE_URL;

test.skip(
  !remoteBaseUrl || (!process.env.QA_READONLY_API_KEY && !process.env.QA_API_KEY),
  "Diagnóstico remoto exige Worker conhecido e credencial técnica de leitura.",
);

test("produção apresenta o estado real da Meta sem erro falso", async ({
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
      metaLive: true,
      webhookConfigured: true,
      meta: {
        tokenValid: true,
        tokenAppMatches: true,
        tokenRequiredScopesPresent: true,
        phoneBelongsToWaba: true,
        effectiveWebhookCallbackMatches: true,
        appWebhookMessagesSubscribed: true,
        appWebhookRequiredFieldsPresent: true,
      },
    });
    await expect(page.getByRole("heading", { name: "Conectado" })).toBeVisible();
    await expect(page.getByText("Token válido na Graph API.")).toBeVisible();
    await expect(page.getByText("Callback efetivo corresponde ao Worker.")).toBeVisible();
    await expect(page.getByText("Eventos messages assinados.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Atualizar assinaturas" })).toBeVisible();
    await expect(page.getByText("Verificação indisponível", { exact: true })).toHaveCount(0);
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
