import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, Eye, FileText, Inbox as InboxIcon, Search, Workflow } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { Card, Modal, PageError, PageLoading, btnSecondary } from "../components/ui";
import { api } from "../lib/api";

type Submission = {
  id: string;
  form_title: string;
  contact_name: string | null;
  contact_phone: string | null;
  source: "form" | "flow";
  payload: Record<string, unknown>;
  created_at: string;
};

export default function Submissions() {
  const [searchParams] = useSearchParams();
  const formId = searchParams.get("formId") || "";
  const [queryText, setQueryText] = useState("");
  const [source, setSource] = useState<"" | "form" | "flow">(formId ? "form" : "");
  const [selected, setSelected] = useState<Submission | null>(null);
  const query = useQuery({
    queryKey: ["submissions", queryText, formId, source],
    queryFn: () =>
      api<{ items: Submission[]; total: number }>(
        `/api/submissions?q=${encodeURIComponent(queryText)}&formId=${encodeURIComponent(formId)}&source=${source}`,
      ),
  });
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-heading-1">Submissões</h1>
          <p className="text-body-sm">
            {formId
              ? "Respostas recebidas por este formulário"
              : "Respostas recebidas por Forms públicos e MiniApps do WhatsApp"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/submissions/export.csv?q=${encodeURIComponent(queryText)}&formId=${encodeURIComponent(formId)}&source=${source}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            <Download size={16} /> Exportar CSV
          </a>
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300">
            <ClipboardList size={16} className="text-primary-400" />
            <strong className="font-semibold text-white">{total}</strong>{" "}
            submissões
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-md">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500"
          />
          <input
            aria-label="Buscar por contato ou origem"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="Buscar contato, telefone ou formulário..."
            className="h-9 w-full rounded-md border border-white/10 bg-zinc-900/60 py-1 pr-3 pl-10 text-base shadow-sm outline-none placeholder:text-zinc-500 md:text-sm"
          />
        </label>
        {!formId && (
          <div className="inline-flex w-fit rounded-xl border border-white/10 bg-zinc-900/60 p-1" aria-label="Filtrar origem">
            {([["", "Todas"], ["form", "Forms"], ["flow", "MiniApps"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setSource(value)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${source === value ? "bg-primary-500/15 text-primary-300" : "text-zinc-400 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {query.error && <PageError message={query.error.message} />}
      {query.isLoading ? (
        <PageLoading />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="mb-4 rounded-2xl bg-zinc-800/50 p-4 text-zinc-500">
            <InboxIcon size={32} />
          </span>
          <h3 className="mb-2 text-lg font-medium text-white">
            Nenhuma submissão encontrada
          </h3>
          <p className="max-w-sm text-sm text-zinc-500">
            As submissões aparecerão aqui quando os leads preencherem seus
            Forms públicos ou MiniApps.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.1fr_110px_1fr_1.2fr_140px_120px] gap-4 border-b border-zinc-800 px-6 py-4 text-xs tracking-widest text-zinc-500 uppercase lg:grid">
            <span>Contato</span>
            <span>Origem</span>
            <span>Form / MiniApp</span>
            <span>Resumo</span>
            <span>Recebido em</span>
            <span className="text-right">Ação</span>
          </div>
          <div className="divide-y divide-zinc-800">
            {query.data?.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-4 px-5 py-5 text-sm lg:min-h-[82px] lg:grid-cols-[1.1fr_110px_1fr_1.2fr_140px_120px] lg:items-center lg:px-6"
              >
                <span>
                  <span className="block font-medium">
                    {item.contact_name || "Sem nome"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {item.contact_phone || "—"}
                  </span>
                </span>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                  {item.source === "form" ? <FileText size={13} /> : <Workflow size={13} />}
                  {item.source === "form" ? "Form" : "MiniApp"}
                </span>
                <span className="font-medium text-zinc-200">{item.form_title}</span>
                <SubmissionSummary payload={item.payload} />
                <span className="text-xs text-zinc-500">
                  {new Date(item.created_at).toLocaleString("pt-BR")}
                </span>
                <button type="button" onClick={() => setSelected(item)} className={`${btnSecondary} justify-self-start lg:justify-self-end`}>
                  <Eye size={15} /> Ver respostas
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {selected && <SubmissionDetails submission={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function responseEntries(payload: Record<string, unknown>) {
  const values = payload.values && typeof payload.values === "object" ? payload.values as Record<string, unknown> : payload;
  return Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

function humanize(key: string) {
  const known: Record<string, string> = { name: "Nome", nome: "Nome", phone: "Telefone", telefone: "Telefone", email: "E-mail" };
  return known[key.toLowerCase()] || key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function summaryEntries(payload: Record<string, unknown>) {
  const entries = responseEntries(payload);
  return entries.slice(0, 2);
}

function SubmissionSummary({ payload }: { payload: Record<string, unknown> }) {
  const entries = summaryEntries(payload);
  if (!entries.length) {
    return <span className="text-xs text-zinc-500">Sem respostas registradas</span>;
  }

  return (
    <dl className="min-w-0 space-y-1 text-xs leading-5">
      {entries.map(([key, value]) => (
        <div key={key} className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-1.5">
          <dt className="font-medium text-zinc-300">{humanize(key)}:</dt>
          <dd className="min-w-0 break-words text-zinc-400">{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubmissionDetails({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const entries = responseEntries(submission.payload);
  return (
    <Modal titleId="submission-details-title" onClose={onClose} showCloseButton panelClassName="max-w-2xl">
      <div className="border-b border-white/10 px-6 py-5 pr-14">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary-300">
          {submission.source === "form" ? <FileText size={14} /> : <Workflow size={14} />}
          {submission.source === "form" ? "Form público" : "MiniApp do WhatsApp"}
        </div>
        <h2 id="submission-details-title" className="text-xl font-semibold text-white">{submission.form_title}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {submission.contact_name || "Contato sem nome"} · {submission.contact_phone || "telefone não informado"}
        </p>
      </div>
      <div className="max-h-[65vh] space-y-3 overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{entries.length} resposta{entries.length === 1 ? "" : "s"}</span>
          <time>{new Date(submission.created_at).toLocaleString("pt-BR")}</time>
        </div>
        {entries.length ? entries.map(([key, value]) => (
          <div key={key} className="rounded-xl border border-white/10 bg-zinc-950/50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{humanize(key)}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{displayValue(value)}</dd>
          </div>
        )) : <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Nenhuma resposta foi registrada.</p>}
      </div>
      <div className="flex justify-end border-t border-white/10 px-6 py-4">
        <button type="button" onClick={onClose} className={btnSecondary}>Fechar</button>
      </div>
    </Modal>
  );
}
