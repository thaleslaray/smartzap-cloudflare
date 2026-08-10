import { ArrowLeft, Home } from "lucide-react";
import { Link, useLocation } from "react-router";

export default function NotFound() {
  const { pathname } = useLocation();
  const retiredWorkflow = pathname.startsWith("/workflows");
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
      <p className="font-mono text-sm uppercase tracking-[0.2em] text-primary-400">{retiredWorkflow ? "Funcionalidade descontinuada" : "Erro 404"}</p>
      <h1 className="mt-4 text-4xl font-bold">{retiredWorkflow ? "Workflows não fazem parte desta versão" : "Esta página não existe"}</h1>
      <p className="mt-4 text-[var(--ds-text-secondary)]">{retiredWorkflow ? "As automações de atendimento continuam disponíveis em Agentes de IA. Os dados antigos foram preservados." : `Não encontramos a rota ${pathname}.`}</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={() => history.back()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--ds-border-default)] px-4 py-3"><ArrowLeft size={18} /> Voltar</button>
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 font-semibold text-zinc-950"><Home size={18} /> Dashboard</Link>
      </div>
    </section>
  );
}
