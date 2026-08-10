import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  FileText,
  Megaphone,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
  Wrench,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Card,
  PageError,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";

type Strategy = "marketing" | "utility";
type Step =
  "paste" | "extract" | "strategy" | "config" | "generating" | "review";
type Generated = {
  name: string;
  content: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  variables: Record<string, string>;
};
const STEPS = [
  ["paste", "Colar", FileText],
  ["extract", "Extrair", Brain],
  ["strategy", "Estratégia", Zap],
  ["config", "Configurar", Sparkles],
  ["review", "Revisar", Check],
] as const;
const strategies = [
  {
    id: "marketing" as const,
    label: "Marketing",
    description: "Texto promocional direto com emojis e urgência",
    when: "Quando você quer promoção direta e explícita",
    icon: Megaphone,
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  {
    id: "utility" as const,
    label: "Utilidade",
    description: "Confirmações, lembretes e atualizações transacionais",
    when: "Quando é uma mensagem transacional real",
    icon: Wrench,
    tone: "border-primary-500/30 bg-primary-500/10 text-primary-400",
  },
];

export default function TemplateProjectNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("paste");
  const [content, setContent] = useState("");
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [prompt, setPrompt] = useState(
    "Crie mensagens claras, variadas e prontas para WhatsApp.",
  );
  const [quantity, setQuantity] = useState(5);
  const [language, setLanguage] = useState("pt_BR");
  const [templates, setTemplates] = useState<Generated[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const summary = useMemo(
    () =>
      content
        .trim()
        .split(/\n+/)
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 6),
    [content],
  );
  const generate = useMutation({
    mutationFn: () =>
      api<{ templates: Generated[] }>("/api/template-projects/generate", {
        method: "POST",
        body: JSON.stringify({ content, prompt, strategy, quantity, language }),
      }),
    onMutate: () => setStep("generating"),
    onSuccess: (data) => {
      setTemplates(data.templates);
      setSelected(new Set(data.templates.map((_, index) => index)));
      setStep("review");
    },
    onError: () => setStep("config"),
  });
  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/template-projects/save-generated", {
        method: "POST",
        body: JSON.stringify({
          title,
          strategy,
          prompt,
          items: templates.filter((_, index) => selected.has(index)),
        }),
      }),
    onSuccess: (project) => navigate(`/templates/${project.id}`),
  });
  const current = STEPS.findIndex(
    ([key]) => key === step || (step === "generating" && key === "config"),
  );
  const reset = () => {
    setStep("paste");
    setContent("");
    setStrategy(null);
    setTemplates([]);
    setSelected(new Set());
    setTitle("");
  };
  return (
    <div className="min-w-0 space-y-8 pb-20">
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <button
          aria-label="Voltar"
          onClick={() => navigate("/templates?tab=projects")}
          className="rounded-full border border-zinc-800 bg-zinc-900 p-2 text-zinc-400"
        >
          <ArrowLeft size={20} />
        </button>
        {step === "review" ? (
          <input
            aria-label="Nome do projeto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do projeto..."
            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xl font-semibold outline-none sm:min-w-[300px]"
          />
        ) : (
          <h1 className="min-w-0 break-words text-xl font-semibold">Novo Projeto de Templates</h1>
        )}
        {strategy && (
          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs uppercase text-zinc-400">
            {strategy}
          </span>
        )}
      </div>
      {step !== "generating" && (
        <div className="flex w-full min-w-0 items-center justify-start gap-2 overflow-hidden lg:justify-center">
          {STEPS.map(([key, label, Icon], index) => (
            <div className="flex items-center gap-2" key={key}>
              <button
                aria-label={`Etapa ${index + 1}: ${label}`}
                aria-current={index === current ? "step" : undefined}
                disabled={index >= current}
                onClick={() => index < current && setStep(key)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${index === current ? "border-primary-500/40 bg-primary-500/20 text-primary-400" : index < current ? "border-zinc-700 text-primary-400" : "border-zinc-800 text-zinc-600"}`}
              >
                <Icon size={16} />
                <span className="hidden lg:inline">{label}</span>
              </button>
              {index < STEPS.length - 1 && (
                <span
                  className={`h-px w-4 shrink-0 lg:w-8 ${index < current ? "bg-primary-500" : "bg-zinc-800"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {step === "paste" && (
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="mb-8 text-center">
            <h2 className="mb-2 text-2xl font-bold">
              Cole qualquer informação sobre o que você quer divulgar
            </h2>
            <p className="text-zinc-500">
              Página de vendas, descrição do evento, notas soltas... a IA vai
              extrair o que importa.
            </p>
          </header>
          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-lg">
            <textarea
              aria-label="Conteúdo fonte"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Cole aqui o conteúdo completo...

Exemplo:
- Página de vendas inteira
- Descrição do produto/evento
- Notas e informações soltas
- E-mail de lançamento
- Post de rede social

Quanto mais informação, melhor!`}
              className="h-80 w-full resize-none rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-base outline-none placeholder:text-[var(--ds-text-muted)] focus:ring-2 focus:ring-emerald-500/30"
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                {content.length} caracteres{" "}
                {content.length < 50 && "(mínimo 50)"}
              </span>
              <button
                className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={content.trim().length < 50}
                onClick={() => {
                  if (!title)
                    setTitle(summary[0]?.slice(0, 80) || "Novo projeto");
                  setStep("extract");
                }}
              >
                <Brain size={20} /> Extrair Informações <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-sm text-emerald-400">
              💡 <strong>Dica:</strong> Você pode colar uma página de vendas
              inteira, um e-mail de lançamento, ou qualquer texto com
              informações sobre o que quer promover.
            </p>
          </div>
        </div>
      )}
      {step === "extract" && (
        <div className="mx-auto max-w-3xl">
          <header className="text-center">
            <h2 className="text-2xl font-bold">Informações identificadas</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Revise o resumo antes de escolher a estratégia.
            </p>
          </header>
          <Card className="mt-8 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {summary.map((line, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-zinc-800 p-4"
                >
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Informação {index + 1}
                  </span>
                  <p className="mt-2 text-sm">{line.slice(0, 260)}</p>
                </div>
              ))}
            </div>
            <label className="mt-5 block text-xs text-zinc-400">
              Nome do projeto
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <div className="mt-6 flex justify-between">
              <button className={btnSecondary} onClick={() => setStep("paste")}>
                <ArrowLeft size={16} /> Voltar
              </button>
              <button
                className={btnPrimary}
                onClick={() => setStep("strategy")}
              >
                Escolher estratégia <ArrowRight size={16} />
              </button>
            </div>
          </Card>
        </div>
      )}
      {step === "strategy" && (
        <div className="mx-auto max-w-5xl">
          <header className="text-center">
            <h2 className="text-2xl font-bold">
              Como os templates devem ser escritos?
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              A estratégia muda o tom e a categoria esperada pela Meta.
            </p>
          </header>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {strategies.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setStrategy(item.id);
                  setStep("config");
                }}
                className={`rounded-2xl border p-6 text-left ${item.tone}`}
              >
                <item.icon size={28} />
                <h3 className="mt-5 text-lg font-semibold">{item.label}</h3>
                <p className="mt-2 text-sm text-zinc-300">{item.description}</p>
                <p className="mt-6 text-xs text-zinc-500">{item.when}</p>
              </button>
            ))}
          </div>
          <button
            className={`mt-6 ${btnSecondary}`}
            onClick={() => setStep("extract")}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      )}
      {step === "config" && (
        <div className="mx-auto max-w-3xl">
          <header className="text-center">
            <h2 className="text-2xl font-bold">Configure a geração</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Você poderá revisar cada resultado antes de salvar.
            </p>
          </header>
          <Card className="mt-8 space-y-5 p-6">
            <label className="block text-xs text-zinc-400">
              Comando para a IA
              <textarea
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs text-zinc-400">
                Quantidade
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                    )
                  }
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs text-zinc-400">
                Idioma
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  <option value="pt_BR">Português (Brasil)</option>
                  <option value="en_US">English</option>
                  <option value="es_ES">Español</option>
                </select>
              </label>
            </div>
            {generate.error && <PageError message={generate.error.message} />}
            <div className="flex justify-between">
              <button
                className={btnSecondary}
                onClick={() => setStep("strategy")}
              >
                <ArrowLeft size={16} /> Voltar
              </button>
              <button
                className={btnPrimary}
                disabled={!prompt.trim()}
                onClick={() => generate.mutate()}
              >
                <Wand2 size={16} /> Gerar templates
              </button>
            </div>
          </Card>
        </div>
      )}
      {step === "generating" && (
        <div className="mx-auto flex min-h-[500px] max-w-3xl flex-col items-center justify-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-400">
            <Sparkles className="animate-pulse" size={32} />
          </span>
          <h2 className="mt-6 text-2xl font-bold">Gerando templates</h2>
          <p className="mt-2 text-sm text-zinc-400">
            O modelo está criando e validando {quantity} variações.
          </p>
        </div>
      )}
      {step === "review" && (
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold">Revise os templates</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {selected.size} de {templates.length} selecionados para salvar.
              </p>
            </div>
            <div className="flex gap-2">
              <button className={btnSecondary} onClick={reset}>
                <RotateCcw size={16} /> Recomeçar
              </button>
              <button
                className={btnPrimary}
                disabled={
                  !title.trim() || selected.size === 0 || save.isPending
                }
                onClick={() => save.mutate()}
              >
                <Save size={16} /> Salvar Projeto
              </button>
            </div>
          </div>
          {save.error && (
            <div className="mt-5">
              <PageError message={save.error.message} />
            </div>
          )}
          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {templates.map((template, index) => (
              <Card
                key={index}
                className={`cursor-pointer p-5 ${selected.has(index) ? "border-primary-500/40" : "opacity-60"}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() =>
                    setSelected((value) => {
                      const next = new Set(value);
                      next.has(index) ? next.delete(index) : next.add(index);
                      return next;
                    })
                  }
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <span className="mt-2 inline-block rounded-md border border-zinc-700 px-2 py-1 text-[10px]">
                        {template.category}
                      </span>
                    </div>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border ${selected.has(index) ? "border-primary-500 bg-primary-500 text-zinc-950" : "border-zinc-700"}`}
                    >
                      {selected.has(index) && <Check size={14} />}
                    </span>
                  </div>
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                    {template.content}
                  </p>
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
