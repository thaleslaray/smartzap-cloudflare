import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Card,
  Modal,
  PageError,
  PageHeader,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";

type Attendant = {
  id: string;
  name: string;
  token: string;
  is_active: boolean;
  access_count: number;
  last_used_at: string | null;
  permissions: { canView: boolean; canReply: boolean; canHandoff: boolean };
};

export default function Attendants() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  const query = useQuery({
    queryKey: ["attendants"],
    queryFn: () => api<Attendant[]>("/api/attendants"),
  });
  const update = useMutation({
    mutationFn: ({ id, is_active }: Pick<Attendant, "id" | "is_active">) =>
      api(`/api/attendants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendants"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/attendants/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendants"] }),
  });
  const copy = async (item: Attendant) => {
    const url = `${window.location.origin}/atendimento?token=${item.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(item.id);
    window.setTimeout(() => setCopied(""), 1500);
  };
  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500/10">
              <Users className="h-6 w-6 text-primary-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-heading-1 break-words">Atendentes</h1>
              <p className="text-body-sm break-words">
                Crie links de acesso para sua equipe atender pelo navegador
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              className="inline-flex min-w-0 h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-base)] px-2 text-xs font-medium sm:px-3"
              onClick={() => query.refetch()}
            >
              <RefreshCw size={14} className="mr-1.5" /> Atualizar
            </button>
            <button
              className="inline-flex min-w-0 h-8 items-center justify-center whitespace-nowrap rounded-lg bg-white px-2 text-xs font-medium text-zinc-900 sm:px-3"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} className="mr-1.5" /> Novo Atendente
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-3xl space-y-6">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-300">
          <div className="flex gap-3">
            <Link2 size={17} className="mt-0.5 shrink-0" />
            <div>
              <h4 className="font-medium">Acesso sem conta</h4>
              <p className="mt-1 text-zinc-400">
                Cada atendente recebe um link único de acesso. Não é necessário
                criar conta ou fazer login. Basta compartilhar o link e o
                atendente pode começar a usar.
              </p>
            </div>
          </div>
        </div>
        {query.error && <PageError message={query.error.message} />}{" "}
        {query.isLoading ? (
          <PageLoading />
        ) : (
          <div className="space-y-3">
            {query.data?.map((item) => (
              <Card
                key={item.id}
                className={`p-5 ${item.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 font-semibold text-primary-400">
                    {item.name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{item.name}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${item.is_active ? "border-primary-500/20 bg-primary-500/10 text-primary-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}
                      >
                        {item.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.access_count} acesso
                      {item.access_count === 1 ? "" : "s"}
                      {item.last_used_at
                        ? ` · Último: ${new Date(item.last_used_at).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-400">
                        <Eye size={12} className="mr-1 inline" />
                        Visualizar
                      </span>
                      <span className="rounded bg-primary-500/10 px-2 py-1 text-primary-400">
                        <MessageSquare size={12} className="mr-1 inline" />
                        Responder
                      </span>
                      {item.permissions.canHandoff && (
                        <span className="rounded bg-violet-500/10 px-2 py-1 text-violet-400">
                          Handoff
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className={btnSecondary} onClick={() => copy(item)}>
                      {copied === item.id ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Copy size={15} />
                      )}{" "}
                      {copied === item.id ? "Copiado" : "Copiar link"}
                    </button>
                    <button
                      className={btnSecondary}
                      onClick={() =>
                        update.mutate({
                          id: item.id,
                          is_active: !item.is_active,
                        })
                      }
                    >
                      {item.is_active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      aria-label={`Excluir ${item.name}`}
                      className="rounded-lg border border-red-900/40 p-2 text-red-400"
                      onClick={() => remove.mutate(item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
            {!query.data?.length && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                <Users size={40} className="mx-auto mb-3 text-zinc-600" />
                <h3 className="mb-1 text-lg font-medium">Nenhum atendente</h3>
                <p className="mb-4 text-sm text-zinc-500">
                  Crie links de acesso para sua equipe
                </p>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-sm font-medium text-zinc-900"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={14} className="mr-1.5" />
                  Criar Primeiro Atendente
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {creating && <CreateAttendant onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateAttendant({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState({
    canView: true,
    canReply: true,
    canHandoff: false,
  });
  const create = useMutation({
    mutationFn: () =>
      api("/api/attendants", {
        method: "POST",
        body: JSON.stringify({ name, permissions }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendants"] });
      onClose();
    },
  });
  return (
    <Modal titleId="attendant-title" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 id="attendant-title" className="text-lg font-semibold">
          Novo Atendente
        </h2>
        <button aria-label="Fechar" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <label className="mt-5 block text-sm text-zinc-400">
        Nome
        <input
          aria-label="Nome"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <div className="mt-5 space-y-3">
        <p className="text-sm text-zinc-400">Permissões</p>
        {[
          ["canView", "Visualizar conversas"],
          ["canReply", "Responder mensagens"],
          ["canHandoff", "Transferir atendimento"],
        ].map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-xl border border-zinc-800 p-3 text-sm"
          >
            {label}
            <input
              type="checkbox"
              checked={permissions[key as keyof typeof permissions]}
              onChange={(e) =>
                setPermissions({ ...permissions, [key]: e.target.checked })
              }
            />
          </label>
        ))}
      </div>
      {create.error && (
        <p className="mt-4 text-sm text-red-400">{create.error.message}</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>
          Cancelar
        </button>
        <button
          className={btnPrimary}
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? (
            <Loader2 className="animate-spin" size={15} />
          ) : (
            <Plus size={15} />
          )}
          Criar
        </button>
      </div>
    </Modal>
  );
}
