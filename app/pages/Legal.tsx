import { useEffect } from "react";
import { Link, useLocation } from "react-router";

const updatedAt = "12 de agosto de 2026";

function PageShell({ title, intro, children }: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · SmartZap`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="legacy-app min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/login" className="text-lg font-semibold tracking-tight text-white">
            SmartZap
          </Link>
          <span className="text-sm text-zinc-400">Instalação autogerenciada</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
          Informação pública
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300">{intro}</p>
        <p className="mt-3 text-sm text-zinc-500">Última atualização: {updatedAt}.</p>
        <div className="mt-10 space-y-9 text-[15px] leading-7 text-zinc-300">
          {children}
        </div>
      </main>
      <footer className="border-t border-zinc-800/80">
        <nav aria-label="Informações legais" className="mx-auto flex w-full max-w-4xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-sm text-zinc-400 sm:px-8">
          <Link className="hover:text-white" to="/privacy">Política de Privacidade</Link>
          <Link className="hover:text-white" to="/data-deletion">Exclusão de dados</Link>
          <Link className="hover:text-white" to="/login">Acessar o SmartZap</Link>
        </nav>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <PageShell
      title="Política de Privacidade do SmartZap"
      intro="Esta política explica como o proprietário desta instalação trata dados no SmartZap para atendimento, campanhas e mensuração de resultados no WhatsApp."
    >
      <Section title="Quem controla os dados">
        <p>O proprietário desta instalação é responsável pelo tratamento descrito nesta página, pela operação do SmartZap e pela definição dos canais de contato com os titulares.</p>
        <p>O projeto open-source SmartZap e seus mantenedores não acessam, operam nem controlam automaticamente os dados mantidos em instalações de terceiros.</p>
      </Section>
      <Section title="Dados tratados">
        <ul className="list-disc space-y-2 pl-5">
          <li>identificadores e informações fornecidas pelo contato no WhatsApp, como nome e telefone;</li>
          <li>mensagens e arquivos necessários para prestar atendimento;</li>
          <li>preferências de consentimento, opt-out, tags e histórico operacional;</li>
          <li>dados técnicos de entrega e segurança;</li>
          <li>origem de anúncios Click-to-WhatsApp, incluindo o identificador técnico do clique;</li>
          <li>eventos comerciais registrados por um operador, como lead, lead qualificado ou compra.</li>
        </ul>
      </Section>
      <Section title="Finalidades">
        <p>Usamos esses dados para responder solicitações, prestar atendimento, executar comunicações autorizadas, manter segurança e auditoria, evitar duplicidades e medir resultados de anúncios iniciados no WhatsApp.</p>
        <p>Um clique em anúncio não é tratado como autorização permanente para campanhas futuras. Preferências e pedidos de opt-out continuam sendo respeitados.</p>
      </Section>
      <Section title="Compartilhamento e infraestrutura">
        <p>Os dados podem ser processados pelos serviços necessários à operação, especialmente Meta/WhatsApp e Cloudflare. Para mensuração de anúncios, o SmartZap envia à Meta somente os campos necessários ao evento, sem enviar transcrição, mídia, nome, telefone ou e-mail pela Conversions API for Business Messaging.</p>
      </Section>
      <Section title="Conservação e segurança">
        <p>O proprietário define e documenta os prazos de retenção aplicáveis à sua operação. O acesso deve ser restrito, identificadores sensíveis são mascarados na interface e registros técnicos não devem conter credenciais.</p>
      </Section>
      <Section title="Seus direitos e contato">
        <p>Você pode solicitar confirmação, acesso, correção, oposição ou exclusão, conforme a legislação aplicável. Use o mesmo canal oficial pelo qual entrou em contato com esta operação e informe que a solicitação se refere aos dados tratados no SmartZap.</p>
        <p><Link className="font-medium text-emerald-300 hover:underline" to="/data-deletion">Consulte as instruções de exclusão de dados.</Link></p>
      </Section>
    </PageShell>
  );
}

function DataDeletion() {
  return (
    <PageShell
      title="Solicitação de exclusão de dados"
      intro="Esta página apresenta o procedimento para pedir ao proprietário desta instalação a exclusão de dados pessoais tratados no SmartZap."
    >
      <Section title="Como solicitar">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Use o mesmo canal oficial de WhatsApp ou atendimento pelo qual se relacionou com esta operação.</li>
          <li>Use o assunto ou a primeira frase “Exclusão de dados — SmartZap”.</li>
          <li>Informe o número de WhatsApp usado no atendimento e descreva quais dados deseja excluir.</li>
          <li>Responda à verificação de titularidade. Nunca envie senha, token ou código de autenticação.</li>
        </ol>
      </Section>
      <Section title="O que acontece depois">
        <p>A solicitação será analisada e os dados serão excluídos ou anonimizados quando aplicável. Se alguma informação precisar ser preservada por obrigação legal, prevenção a fraude, exercício de direitos ou segurança, você receberá a explicação correspondente pelo canal de atendimento.</p>
      </Section>
      <Section title="Dados da Meta e do WhatsApp">
        <p>A exclusão no SmartZap não apaga automaticamente dados mantidos pela Meta ou pelo WhatsApp sob responsabilidade própria. Para esses dados, também podem ser necessários os controles e canais oferecidos pela Meta.</p>
      </Section>
      <Section title="Acompanhar a solicitação">
        <p>Guarde o protocolo fornecido pelo canal de atendimento. Ele será usado para acompanhar o pedido sem publicar informações pessoais nesta página.</p>
      </Section>
    </PageShell>
  );
}

export default function Legal() {
  return useLocation().pathname === "/data-deletion" ? <DataDeletion /> : <PrivacyPolicy />;
}
