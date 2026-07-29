import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Braces, Check, ChevronRight, Eye, Save, Send } from "lucide-react";
import { api } from "../lib/api";
import {
  Card,
  Modal,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";
import {
  insertTemplateVariable,
  positionalTemplateVariables,
} from "../lib/template-variables";
import {
  META_TEMPLATE_BODY_MAX_LENGTH,
  META_TEMPLATE_FOOTER_MAX_LENGTH,
  templateBodyExample,
  validateMetaTemplateContent,
} from "../../shared/template-validation";

type Draft = {
  id: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: Array<{
    type: string;
    text?: string;
    buttons?: TemplateButton[];
  }>;
  status: string;
  error_detail?: string | null;
};
type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};
type Form = {
  name: string;
  language: string;
  category: Draft["category"];
  body: string;
  footer: string;
  buttons: TemplateButton[];
  preservedComponents: Record<string, unknown>[];
  preservedButtons: Record<string, unknown>[];
};
function defaultTemplateName() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `template_${stamp}`;
}
const initial: Form = {
  name: defaultTemplateName(),
  language: "pt_BR",
  category: "MARKETING",
  body: "",
  footer: "",
  buttons: [],
  preservedComponents: [],
  preservedButtons: [],
};
const draftControlClass =
  "h-9 w-full min-w-0 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-1 text-base text-zinc-100 shadow-sm outline-none focus:border-primary-400 md:text-sm";

export default function TemplateDraft() {
  const { id = "new" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === "new";
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(initial);
  const [savedId, setSavedId] = useState(isNew ? "" : id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const draft = useQuery({
    queryKey: ["template-draft", id],
    queryFn: () => api<Draft>(`/api/templates/drafts/${id}`),
    enabled: !isNew,
  });
  useEffect(() => {
    if (!draft.data) return;
    const body =
      draft.data.components.find((c) => c.type === "BODY")?.text || "";
    const footer =
      draft.data.components.find((c) => c.type === "FOOTER")?.text || "";
    const buttons =
      draft.data.components.find((c) => c.type === "BUTTONS")?.buttons ||
      [];
    const supportedButtons = buttons.filter(
      (button): button is TemplateButton =>
        button.type === "QUICK_REPLY" ||
        button.type === "URL" ||
        button.type === "PHONE_NUMBER",
    );
    setForm({
      name: draft.data.name,
      language: draft.data.language,
      category: draft.data.category,
      body,
      footer,
      buttons: supportedButtons,
      preservedComponents: draft.data.components.filter(
        (component) => !["BODY", "FOOTER", "BUTTONS"].includes(component.type),
      ) as Record<string, unknown>[],
      preservedButtons: buttons.filter(
        (button) => !supportedButtons.includes(button as TemplateButton),
      ) as Record<string, unknown>[],
    });
  }, [draft.data]);
  const payload = useMemo(
    () => ({
      name: form.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_"),
      language: form.language,
      category: form.category,
      components: [
        ...form.preservedComponents,
        {
          type: "BODY",
          text: form.body,
          ...(templateBodyExample(form.body)
            ? { example: templateBodyExample(form.body) }
            : {}),
        },
        ...(form.footer.trim() ? [{ type: "FOOTER", text: form.footer }] : []),
        ...(form.buttons.length
          ? [
              {
                type: "BUTTONS",
                buttons: [...form.buttons.map((button) => ({
                  type: button.type,
                  text: button.text.trim(),
                  ...(button.type === "URL" ? { url: button.url?.trim() } : {}),
                  ...(button.type === "PHONE_NUMBER"
                    ? { phone_number: button.phone_number?.trim() }
                    : {}),
                })), ...form.preservedButtons],
              },
            ]
          : []),
      ],
    }),
    [form],
  );
  const save = useMutation({
    mutationFn: () =>
      api<Draft>(
        savedId ? `/api/templates/drafts/${savedId}` : "/api/templates/drafts",
        { method: savedId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: (value) => {
      setSavedId(value.id);
      qc.invalidateQueries({ queryKey: ["templates"] });
      if (isNew) navigate(`/templates/drafts/${value.id}`, { replace: true });
    },
  });
  const submit = useMutation({
    mutationFn: async () => {
      let target = savedId;
      if (!target) target = (await save.mutateAsync()).id;
      return api<{ ok: true }>(`/api/templates/drafts/${target}/submit`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      navigate("/templates");
    },
  });
  if (draft.isLoading) return <PageLoading label="Carregando rascunho…" />;
  if (draft.error)
    return (
      <PageError
        message={draft.error.message}
        onRetry={() => draft.refetch()}
      />
    );
  const buttonsValid = form.buttons.every(
    (button) =>
      button.text.trim() &&
      (button.type === "QUICK_REPLY" ||
        (button.type === "URL" && /^https:\/\//.test(button.url?.trim() || "")) ||
        (button.type === "PHONE_NUMBER" && /^\+?[1-9]\d{7,14}$/.test(button.phone_number?.trim() || ""))),
  );
  const contentIssues = validateMetaTemplateContent(form.body, form.footer);
  const bodyIssues = contentIssues.filter((issue) => issue.field === "body");
  const footerIssues = contentIssues.filter((issue) => issue.field === "footer");
  const contentValid = contentIssues.length === 0;
  const valid = Boolean(payload.name && contentValid && buttonsValid);
  const variables = positionalTemplateVariables(form.body);
  const addVariable = () => {
    const field = bodyRef.current;
    const start = field?.selectionStart ?? form.body.length;
    const end = field?.selectionEnd ?? start;
    const inserted = insertTemplateVariable(form.body, start, end);
    setForm({ ...form, body: inserted.value });
    requestAnimationFrame(() => {
      if (!field) return;
      field.focus();
      field.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  };
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-8 pb-20">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/templates")}
            className="inline-flex w-[89px] shrink-0 items-center justify-center rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <div>
            <h1 className="max-w-none text-2xl font-bold leading-tight tracking-tight sm:text-heading-1">
              {isNew && !savedId ? "Novo template" : "Editar template"}
            </h1>
            <p className="text-body-sm">
              Crie seu template e envie pra aprovação.
            </p>
          </div>
        </div>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {["Configuracao", "Conteudo", "Botoes"].map((label, index) => {
              const value = index + 1;
              const mobileLabel = ["Config.", "Conteúdo", "Botões"][index];
              return (
                <button
                  key={label}
                  data-testid="template-step"
                  disabled={value === 3 && !contentValid}
                  onClick={() => setStep(value)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-3 sm:text-left disabled:cursor-not-allowed disabled:opacity-40 ${step === value ? "border-primary-500/40 bg-primary-500/10" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-zinc-500"}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step === value ? "border-primary-400 bg-primary-500/20 text-primary-300" : "border-[var(--ds-border-default)]"}`}
                  >
                    {step > value ? <Check size={16} /> : value}
                  </span>
                  <span className="min-w-0 whitespace-nowrap text-[10px] uppercase tracking-[0.12em] sm:hidden">
                    {mobileLabel}
                  </span>
                  <span className="hidden min-w-0 whitespace-nowrap text-xs uppercase tracking-widest sm:inline">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          {(save.error || submit.error) && (
            <PageError message={(save.error ?? submit.error)?.message} />
          )}
          <Card className="min-h-[560px] overflow-hidden p-0">
            <div className="min-h-[480px] p-6">
            {step === 1 && (
              <div>
                <h2 className="text-base font-semibold">
                  Nome e idioma do modelo
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Defina como o modelo sera identificado.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">
                      Nome
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      className={draftControlClass}
                    />
                    <span className="block text-xs font-normal text-zinc-500">
                      Apenas <span className="font-mono">a-z 0-9 _</span>
                    </span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">
                      Categoria
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          category: e.target.value as Form["category"],
                        })
                      }
                      className={draftControlClass}
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utilidade</option>
                      <option value="AUTHENTICATION">Autenticacao</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">
                      Idioma
                    </label>
                    <select
                      value={form.language}
                      onChange={(e) =>
                        setForm({ ...form, language: e.target.value })
                      }
                      className={draftControlClass}
                    >
                      <option value="pt_BR">pt_BR</option>
                      <option value="en_US">en_US</option>
                      <option value="es_ES">es_ES</option>
                    </select>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  ID do rascunho:{" "}
                  <span className="font-mono">{savedId || "new"}</span>
                </p>
              </div>
            )}
            {step === 2 && (
              <div>
                <h2 className="text-lg font-semibold">Conteúdo</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Use variáveis numeradas como {"{{1}}"} e {"{{2}}"}.
                </p>
                <label className="mt-6 block text-xs text-zinc-400">
                  Mensagem
                  <textarea
                    ref={bodyRef}
                    aria-label="Mensagem do template"
                    rows={8}
                    maxLength={META_TEMPLATE_BODY_MAX_LENGTH}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Olá {{1}}, sua aula começa às {{2}}."
                    aria-invalid={bodyIssues.length > 0}
                    aria-describedby="template-body-rules template-body-errors"
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-right text-[10px] text-zinc-600">
                    {form.body.length}/{META_TEMPLATE_BODY_MAX_LENGTH}
                  </span>
                </label>
                <p id="template-body-rules" className="mt-2 text-xs text-zinc-500">
                  A Meta exige texto antes e depois das variáveis e numeração sequencial a partir de {"{{1}}"}.
                </p>
                {bodyIssues.length > 0 && (
                  <div
                    id="template-body-errors"
                    role="alert"
                    className="mt-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                  >
                    <p className="font-medium">Corrija antes de continuar:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {bodyIssues.map((issue) => (
                        <li key={issue.code}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addVariable}
                    className={`${btnSecondary} min-h-11 px-3 py-2 text-xs`}
                  >
                    <Braces size={16} /> Adicionar variável
                  </button>
                  {variables.map((variable) => (
                    <span
                      key={variable}
                      className="rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1.5 font-mono text-xs text-primary-300"
                    >
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
                <label className="mt-4 block text-xs text-zinc-400">
                  Rodapé opcional
                  <input
                    value={form.footer}
                    maxLength={META_TEMPLATE_FOOTER_MAX_LENGTH}
                    onChange={(e) =>
                      setForm({ ...form, footer: e.target.value })
                    }
                    aria-invalid={footerIssues.length > 0}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-right text-[10px] text-zinc-600">
                    {form.footer.length}/{META_TEMPLATE_FOOTER_MAX_LENGTH}
                  </span>
                </label>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold">Botões</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Adicione respostas rápidas, links ou telefone ao template.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(
                    [
                      ["QUICK_REPLY", "Resposta rápida"],
                      ["URL", "Link"],
                      ["PHONE_NUMBER", "Telefone"],
                    ] as const
                  ).map(([type, label]) => (
                    <button
                      type="button"
                      key={type}
                      disabled={form.buttons.length >= 10}
                      onClick={() =>
                        setForm({
                          ...form,
                          buttons: [
                            ...form.buttons,
                            {
                              type,
                              text: "",
                              ...(type === "URL" ? { url: "" } : {}),
                              ...(type === "PHONE_NUMBER"
                                ? { phone_number: "" }
                                : {}),
                            },
                          ],
                        })
                      }
                      className={`${btnSecondary} px-3 py-2 text-xs`}
                    >
                      + {label}
                    </button>
                  ))}
                </div>
                {form.buttons.length ? (
                  <div className="mt-5 space-y-3">
                    {form.buttons.map((button, index) => (
                      <div
                        key={`${button.type}-${index}`}
                        className="grid gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3 md:grid-cols-[150px_1fr_auto]"
                      >
                        <select
                          aria-label={`Tipo do botão ${index + 1}`}
                          value={button.type}
                          onChange={(event) => {
                            const type = event.target.value as TemplateButton["type"];
                            setForm({
                              ...form,
                              buttons: form.buttons.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      type,
                                      text: item.text,
                                      ...(type === "URL" ? { url: item.url || "" } : {}),
                                      ...(type === "PHONE_NUMBER"
                                        ? { phone_number: item.phone_number || "" }
                                        : {}),
                                    }
                                  : item,
                              ),
                            });
                          }}
                          className={draftControlClass}
                        >
                          <option value="QUICK_REPLY">Resposta rápida</option>
                          <option value="URL">Link</option>
                          <option value="PHONE_NUMBER">Telefone</option>
                        </select>
                        <div className="space-y-2">
                          <input
                            aria-label={`Texto do botão ${index + 1}`}
                            value={button.text}
                            maxLength={25}
                            placeholder="Texto do botão"
                            onChange={(event) =>
                              setForm({
                                ...form,
                                buttons: form.buttons.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, text: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            className={draftControlClass}
                          />
                          {button.type === "URL" && (
                            <input
                              aria-label={`URL do botão ${index + 1}`}
                              value={button.url || ""}
                              placeholder="https://exemplo.com"
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  buttons: form.buttons.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, url: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                              className={draftControlClass}
                            />
                          )}
                          {button.type === "PHONE_NUMBER" && (
                            <input
                              aria-label={`Telefone do botão ${index + 1}`}
                              value={button.phone_number || ""}
                              placeholder="+5511999999999"
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  buttons: form.buttons.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, phone_number: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                              className={draftControlClass}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={`Remover botão ${index + 1}`}
                          onClick={() =>
                            setForm({
                              ...form,
                              buttons: form.buttons.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            })
                          }
                          className="self-start rounded-md border border-red-500/40 px-2 py-2 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
                    Nenhum botão adicionado.
                  </div>
                )}
              </div>
            )}
            </div>
            <div className="border-t border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  className={btnSecondary}
                  disabled={step === 1}
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                >
                  Voltar
                </button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    className={btnSecondary}
                    disabled={!payload.name || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    <Save size={16} /> Salvar rascunho
                  </button>
                  {step < 3 ? (
                    <button
                      className={btnPrimary}
                      disabled={
                        (step === 1 && !payload.name) ||
                        (step === 2 && !contentValid)
                      }
                      onClick={() => setStep((s) => Math.min(3, s + 1))}
                    >
                      Continuar <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      className={btnPrimary}
                      disabled={!valid || submit.isPending}
                      onClick={() => submit.mutate()}
                    >
                      <Send size={16} /> Enviar para Meta
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className="hidden space-y-6 self-start lg:sticky lg:top-6 lg:block">
          <Preview form={form} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-500/25 lg:hidden"
      >
        <Eye size={20} /> Preview
      </button>
      {previewOpen && (
        <Modal
          titleId="template-draft-preview-title"
          onClose={() => setPreviewOpen(false)}
          panelClassName="max-w-xl"
        >
          <div className="flex items-center justify-between gap-4">
            <h2
              id="template-draft-preview-title"
              className="text-lg font-semibold"
            >
              Prévia do modelo
            </h2>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className={btnSecondary}
            >
              Fechar
            </button>
          </div>
          <div className="mt-5">
            <Preview form={form} />
          </div>
        </Modal>
      )}
    </div>
  );
}
function Preview({ form }: { form: Form }) {
  const text = ["Joao", "19:00", "01/12"].reduce(
    (v, r, i) => v.replaceAll(`{{${i + 1}}}`, r),
    form.body,
  );
  return (
    <Card className="h-fit overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--ds-border-default)] px-6 py-4">
        <h2 className="text-sm font-semibold">Previa do modelo</h2>
      </div>
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--ds-border-default)] bg-[#efeae2]">
            <div className="flex h-11 items-center gap-2 bg-[#075e54] px-3 text-white">
              <div className="h-7 w-7 rounded-full bg-white/20" />
              <div className="min-w-0">
                <div className="truncate text-[12px] leading-none font-semibold">
                  Business
                </div>
                <div className="mt-0.5 truncate text-[10px] leading-none text-white/80">
                  template
                </div>
              </div>
            </div>
            <div className="p-3">
              <div className="max-w-90 overflow-hidden rounded-xl bg-white text-zinc-900 shadow-sm">
                <div className="px-3 py-2">
                  <div className="text-[13px] leading-snug whitespace-pre-wrap">
                    {text || (
                      <span className="text-zinc-400">
                        Digite o corpo para ver a previa.
                      </span>
                    )}
                  </div>
                  {form.footer && (
                    <p className="mt-1 text-[11px] whitespace-pre-wrap text-zinc-500">
                      {form.footer}
                    </p>
                  )}
                  <p className="mt-1 flex items-center justify-end text-[10px] text-zinc-400">
                    16:34
                  </p>
                </div>
                {form.buttons.length ? (
                  <div className="border-t border-zinc-200">
                    {form.buttons.map((button, index) => (
                      <div
                        key={`${button.type}-${index}`}
                        className="border-t border-zinc-100 px-3 py-2 text-center text-[12px] font-medium text-[#00a884] first:border-t-0"
                      >
                        {button.text || "Texto do botão"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
