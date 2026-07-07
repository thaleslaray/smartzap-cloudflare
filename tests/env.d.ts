// Nesta versão do vitest-pool-workers, `env` de 'cloudflare:test' é tipado como
// Cloudflare.Env (namespace aberto declarado no worker-configuration.d.ts).
// Augmentamos esse namespace para adicionar o binding de teste TEST_MIGRATIONS,
// injetado pelo vitest.config.ts via readD1Migrations().
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}

// Espelha o binding no `Env` global também: DOs (ex.: PhoneThrottle) são tipados
// com `Env`, e `runInDurableObject` (cloudflare:test) exige que essa classe seja
// estruturalmente compatível com `Cloudflare.Env` — sem isso, o `env` diverge só
// no ambiente de teste e a inferência de tipo de `runInDurableObject` quebra.
interface Env {
  TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
}
