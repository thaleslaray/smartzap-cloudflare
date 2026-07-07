import { expect, test } from '@playwright/test'

test('login → dashboard → import de contato', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Senha mestra').fill('dev')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Contatos', exact: true }).click()
  await page.getByRole('button', { name: 'Importar CSV' }).click()
  // Telefone único por execução: o D1 de dev persiste entre rodadas e um número fixo
  // vira duplicado no INSERT OR IGNORE ("0 importados") ao reexecutar. Mantém o prefixo
  // válido do original (11 9 9999 ....) para o normalizePhone aceitar como BR móvel.
  const phone = '1199999' + String(Date.now()).slice(-4)
  await page.getByPlaceholder(/telefone,nome/).fill(`telefone,nome\n${phone},E2E`)
  const importBtn = page.getByRole('button', { name: 'Importar', exact: true })
  await expect(importBtn).toBeDisabled() // sem opt-in não importa
  await page.getByRole('checkbox').check()
  await importBtn.click()
  await expect(page.getByText(/1 importados/)).toBeVisible()
})

test('guarda de rota: sem sessão, /campaigns redireciona para /login', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/campaigns')
  // o Shell (Task 14) consulta /api/auth/status ao montar; o 401 dispara o
  // redirect para /login feito pelo próprio api client
  await expect(page).toHaveURL(/\/login/)
})
