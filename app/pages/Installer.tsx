import { ArrowUpRight, Cloud, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { Card, Logo, focusRing } from "../components/ui";

const PROVISIONER_URL = "https://smartzap-provisioner.thales2581.workers.dev/";

const steps = [
  {
    icon: ShieldCheck,
    title: "Autorize a conta",
    description: "A Cloudflare mostra as permissões mínimas e deixa você escolher explicitamente onde instalar.",
  },
  {
    icon: LockKeyhole,
    title: "Crie sua senha e seu cofre",
    description: "Os dois valores nascem no navegador e seguem uma única vez como secrets do novo Worker.",
  },
  {
    icon: Database,
    title: "Confira e instale",
    description: "O plano bloqueia colisões e só libera o SmartZap depois de criar e validar todos os recursos.",
  },
] as const;

export default function Installer() {
  return (
    <main className="min-h-screen bg-[#090d0b] px-4 py-8 text-[var(--ds-text-primary)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-center gap-3">
          <Logo size={42} />
          <div>
            <p className="text-sm font-semibold">SmartZap</p>
            <p className="text-xs text-[var(--ds-text-muted)]">Instalação segura na sua Cloudflare</p>
          </div>
        </header>

        <section className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#96f6bc]">Instalador oficial</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Instale sem terminal, token de API ou GitHub Actions.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--ds-text-secondary)] sm:text-base">
            O provisionador usa OAuth da Cloudflare, cria um plano antes de tocar na conta e interrompe a instalação se encontrar qualquer colisão.
          </p>
        </section>

        <Card className="mt-8 p-5 sm:p-7">
          <ol className="grid gap-5">
            {steps.map(({ icon: Icon, title, description }, index) => (
              <li key={title} className="flex items-start gap-4 border-b border-white/10 pb-5 last:border-0 last:pb-0">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-[#96f6bc]/20 bg-[#96f6bc]/10 text-[#96f6bc]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">Etapa {index + 1}</p>
                  <h2 className="mt-1 text-base font-semibold">{title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--ds-text-secondary)]">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <a
          href={PROVISIONER_URL}
          className={`mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f1fff6] px-5 text-sm font-semibold text-[#0b1711] sm:w-auto ${focusRing}`}
        >
          <Cloud size={18} aria-hidden="true" />
          Abrir instalador seguro
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--ds-text-muted)]">
          A senha administrativa e a chave do cofre serão criadas somente no próximo passo. O SmartZap não pede sua senha da Cloudflare nem um API Token.
        </p>
      </div>
    </main>
  );
}
