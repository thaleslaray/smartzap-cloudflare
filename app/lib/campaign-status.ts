export type CampaignDisplayStatus = {
  label: string;
  className: string;
};

export function getCampaignDisplayStatus(
  status: string,
  failed: number,
): CampaignDisplayStatus {
  if (status === "completed" && failed > 0) {
    return {
      label: "Concluída com falhas",
      className: "border-red-500/30 bg-red-500/10 text-red-400",
    };
  }

  const statuses: Record<string, CampaignDisplayStatus> = {
    draft: { label: "Rascunho", className: "border-zinc-700 bg-zinc-800 text-zinc-400" },
    scheduled: { label: "Agendado", className: "border-purple-500/20 bg-purple-500/10 text-purple-400" },
    sending: { label: "Enviando", className: "border-blue-500/20 bg-blue-500/10 text-blue-400" },
    completed: { label: "Concluído", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
    paused: { label: "Pausado", className: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
    failed: { label: "Falhou", className: "border-red-500/20 bg-red-500/10 text-red-400" },
    cancelled: { label: "Cancelado", className: "border-zinc-700 bg-zinc-800 text-zinc-400" },
  };

  return statuses[status] ?? statuses.draft;
}
