import { ArrowUpRight, Cloud, GitFork, LockKeyhole, ShieldCheck, Zap } from "lucide-react";
import { Card, Logo, focusRing } from "../components/ui";

const FORK_INSTALLER_URL = "https://instalar.escoladeautomacao.com/smartzap/fork";
const QUICK_INSTALLER_URL = "https://instalar.escoladeautomacao.com/smartzap/quick";

const forkSteps = [
  {
    icon: GitFork,
    title: "Crie seu fork",
    description: "O código fica na sua conta GitHub, com vínculo ao projeto oficial e liberdade para personalizar.",
  },
  {
    icon: LockKeyhole,
    title: "Conecte à sua Cloudflare",
    description: "Workers Builds recebe os secrets e executa o provisionamento sem colocá-los no Git ou no frontend.",
  },
  {
    icon: ShieldCheck,
    title: "Homologue em /setup",
    description: "O SmartZap só é liberado depois de validar a infraestrutura, a Meta, o webhook e uma mensagem real.",
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

        <section className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#96f6bc]">Instalador oficial</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Escolha quem controla o código do seu SmartZap.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--ds-text-secondary)] sm:text-base">
            Para produção, recomendamos o fork próprio. A instalação rápida continua disponível para avaliação, em uma versão fixa e sem atualizações automáticas.
          </p>
        </section>

        <Card className="mt-8 border-[#96f6bc]/30 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-[#96f6bc]/30 bg-[#96f6bc]/10 px-3 py-1 text-xs font-semibold text-[#96f6bc]">
                Recomendado para produção
              </span>
              <h2 className="mt-4 text-xl font-semibold">Instalação com código próprio</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ds-text-secondary)]">
                Você cria um fork verdadeiro, controla a publicação e decide quando receber atualizações por pull request. A manutenção da instalação é sua.
              </p>
            </div>
            <GitFork className="shrink-0 text-[#96f6bc]" size={30} aria-hidden="true" />
          </div>
          <ol className="grid gap-5">
            {forkSteps.map(({ icon: Icon, title, description }, index) => (
              <li key={title} className="mt-5 flex items-start gap-4 border-b border-white/10 pb-5 last:border-0 last:pb-0">
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
          <a
            href={FORK_INSTALLER_URL}
            className={`mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f1fff6] px-5 text-sm font-semibold text-[#0b1711] sm:w-auto ${focusRing}`}
          >
            <GitFork size={18} aria-hidden="true" />
            Criar meu SmartZap com fork
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </Card>

        <Card className="mt-5 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-[var(--ds-text-muted)]" aria-hidden="true" />
                <h2 className="text-lg font-semibold">Instalação rápida</h2>
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ds-text-secondary)]">
                O provisionador OAuth cria uma cópia independente na sua Cloudflare. É uma versão fixa, sem repositório Git e sem manutenção ou atualização incluída.
              </p>
            </div>
            <a
              href={QUICK_INSTALLER_URL}
              className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-semibold text-[var(--ds-text-primary)] ${focusRing}`}
            >
              <Cloud size={18} aria-hidden="true" />
              Usar instalação rápida
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </Card>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--ds-text-muted)]">
          Em ambas as modalidades, senha administrativa e chave do cofre permanecem sob controle do proprietário. O SmartZap Community não opera nem atualiza instalações de terceiros.
        </p>
      </div>
    </main>
  );
}
