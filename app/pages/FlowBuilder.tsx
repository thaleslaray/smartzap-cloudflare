import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  LayoutTemplate,
  MoreVertical,
  PenSquare,
  Plus,
  Send,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { FLOW_TEMPLATES } from "../lib/flow-templates";
import {
  Card,
  PageError,
  PageLoading,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";
type Screen = {
  id: string;
  title: string;
  final: boolean;
  text: string;
  buttonText: string;
  next: string | null;
  blocks?: FlowBlock[];
};
type FlowBlock = {
  id: string;
  type:
    | "TextHeading"
    | "TextSubheading"
    | "TextBody"
    | "TextCaption"
    | "TextInput"
    | "TextArea"
    | "Dropdown"
    | "RadioButtonsGroup"
    | "CheckboxGroup"
    | "CalendarPicker"
    | "OptIn";
  text?: string;
  label?: string;
  name?: string;
  required?: boolean;
  inputType?: "text" | "email" | "phone" | "number";
  options?: Array<{ id: string; title: string }>;
};
type BranchRule = {
  field: string;
  op:
    | "is_filled"
    | "is_empty"
    | "equals"
    | "contains"
    | "gt"
    | "lt"
    | "is_true"
    | "is_false";
  value: string;
  next: string | null;
};
type Definition = {
  version: string;
  screens: Screen[];
  dynamicBooking?: boolean;
  branchesByScreen?: Record<string, BranchRule[]>;
  confirmation?: {
    enabled?: boolean;
    title?: string;
    footer?: string;
    fields?: string[];
    labels?: Record<string, string>;
  };
};
type FlowMapping = {
  contact?: { nameField?: string; emailField?: string };
  customFields?: Record<string, string>;
};
const blockOptions: Array<{
  key: string;
  type: FlowBlock["type"];
  label: string;
  inputType?: FlowBlock["inputType"];
}> = [
  { key: "heading", type: "TextHeading", label: "Título" },
  { key: "subheading", type: "TextSubheading", label: "Subtítulo" },
  { key: "body", type: "TextBody", label: "Texto" },
  { key: "caption", type: "TextCaption", label: "Legenda" },
  { key: "text", type: "TextInput", label: "Campo: texto", inputType: "text" },
  { key: "long", type: "TextArea", label: "Campo: texto longo" },
  { key: "email", type: "TextInput", label: "Campo: e-mail", inputType: "email" },
  { key: "phone", type: "TextInput", label: "Campo: telefone", inputType: "phone" },
  { key: "number", type: "TextInput", label: "Campo: número", inputType: "number" },
  { key: "date", type: "CalendarPicker", label: "Campo: data" },
  { key: "dropdown", type: "Dropdown", label: "Lista (dropdown)" },
  { key: "single", type: "RadioButtonsGroup", label: "Escolha única" },
  { key: "multi", type: "CheckboxGroup", label: "Múltipla escolha" },
  { key: "optin", type: "OptIn", label: "Opt-in (checkbox)" },
];
const flowTextLimits: Partial<Record<FlowBlock["type"], number>> = {
  TextHeading: 80,
  TextSubheading: 80,
  TextBody: 4096,
  TextCaption: 409,
  OptIn: 120,
};
const flowLabelLimits: Partial<Record<FlowBlock["type"], number>> = {
  TextInput: 20,
  TextArea: 20,
  Dropdown: 20,
  RadioButtonsGroup: 30,
  CheckboxGroup: 30,
  CalendarPicker: 40,
};
const flowOptionLimits: Partial<Record<FlowBlock["type"], number>> = {
  Dropdown: 200,
  RadioButtonsGroup: 20,
  CheckboxGroup: 20,
};
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "campo";
const newBlock = (
  type: FlowBlock["type"],
  inputType?: FlowBlock["inputType"],
): FlowBlock => {
  const id = crypto.randomUUID();
  if (type.startsWith("Text")) {
    const defaults: Record<string, string> = {
      TextHeading: "Novo título",
      TextSubheading: "Novo subtítulo",
      TextBody: "Novo texto",
      TextCaption: "Legenda",
    };
    if (defaults[type]) return { id, type, text: defaults[type] };
  }
  if (type === "OptIn")
    return {
      id,
      type,
      name: `optin_${id.slice(0, 4)}`,
      text: "Quero receber novidades e promoções.",
    };
  const label = type === "CalendarPicker" ? "Data" : "Preencha este campo";
  return {
    id,
    type,
    name: `${slug(label)}_${id.slice(0, 4)}`,
    label,
    required: type !== "CheckboxGroup",
    ...(type === "TextInput" ? { inputType: inputType ?? "text" } : {}),
    ...(["Dropdown", "RadioButtonsGroup", "CheckboxGroup"].includes(type)
      ? {
          options: [
            { id: "opcao_1", title: "Opção 1" },
            { id: "opcao_2", title: "Opção 2" },
          ],
        }
      : {}),
  };
};
type Flow = {
  id: string;
  name: string;
  status: string;
  meta_id?: string | null;
  meta_preview_url?: string | null;
  validationErrors?: unknown;
  definition: Definition;
  mapping?: FlowMapping;
  local_revision: number;
};
const baseScreen = (name: string): Screen => ({
  id: crypto.randomUUID(),
  title: name,
  final: true,
  text: "Preencha os dados abaixo:",
  buttonText: "Enviar",
  next: null,
});
export default function FlowBuilder() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["flow", id],
    queryFn: () => api<Flow>(`/api/flows/${id}`),
  });
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<Definition>({
    version: "7.3",
    screens: [],
  });
  const [mapping, setMapping] = useState<FlowMapping>({});
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(1);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [screenMenuOpen, setScreenMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name);
    const incoming = query.data.definition?.screens?.length
      ? query.data.definition
      : { version: "7.3", screens: [baseScreen(query.data.name)] };
    setDefinition(incoming);
    setMapping(query.data.mapping ?? {});
    setDirty(false);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      api<Flow>(`/api/flows/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          definition,
          mapping,
          expectedRevision: query.data?.local_revision,
        }),
      }),
    onSuccess: (flow) => {
      setDirty(false);
      qc.setQueryData(["flow", id], flow);
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return api<{ ok: true; item: Flow }>(`/api/flows/${id}/meta/publish`, {
        method: "POST",
        body: JSON.stringify({ publish: true }),
      });
    },
    onSuccess: ({ item }) => {
      qc.setQueryData(["flow", id], item);
      qc.invalidateQueries({ queryKey: ["flows"] });
    },
  });
  const generateWithAI = useMutation({
    mutationFn: (prompt: string) =>
      api<{ definition: Definition }>("/api/flows/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
  });
  if (query.isLoading) return <PageLoading label="Carregando miniapp..." />;
  if (query.error) return <PageError message={query.error.message} />;
  const screen = definition.screens[active];
  const blocks: FlowBlock[] = screen
    ? screen.blocks?.length
      ? screen.blocks
      : [
          {
            id: `legacy-${screen.id}`,
            type: "TextBody",
            text: screen.text,
          },
        ]
    : [];
  const update = (patch: Partial<Screen>) => {
    setDirty(true);
    setDefinition((d) => ({
        ...d,
        screens: d.screens.map((s, i) =>
          i === active ? { ...s, ...patch } : s,
        ),
      }));
  };
  const addScreen = () => {
    if (definition.screens.length >= 10) {
      setScreenMenuOpen(false);
      return;
    }
    setDirty(true);
    const next = baseScreen(`Tela ${definition.screens.length + 1}`);
    next.final = true;
    setDefinition((d) => ({
      ...d,
      screens: [
        ...d.screens.map((s) => ({
          ...s,
          final: false,
          next: s.next ?? next.id,
        })),
        next,
      ],
    }));
    setActive(definition.screens.length);
    setScreenMenuOpen(false);
  };
  const patchBlocks = (next: FlowBlock[]) =>
    update({
      blocks: next,
      text:
        next.find((block) => block.type === "TextBody")?.text ??
        next.find((block) => block.text)?.text ??
        "",
    });
  const addBlock = (
    type: FlowBlock["type"],
    inputType?: FlowBlock["inputType"],
  ) => {
    if (blocks.length >= 48) {
      setAddMenuOpen(false);
      return;
    }
    if (type === "OptIn" && blocks.filter((block) => block.type === "OptIn").length >= 5) {
      setAddMenuOpen(false);
      return;
    }
    patchBlocks([...blocks, newBlock(type, inputType)]);
    setAddMenuOpen(false);
  };
  const updateBlock = (index: number, patch: Partial<FlowBlock>) =>
    patchBlocks(
      blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...patch } : block,
      ),
    );
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    patchBlocks(next);
  };
  const activeBranches = screen
    ? definition.branchesByScreen?.[screen.id] ?? []
    : [];
  const fieldBlocks = blocks.filter((block) => block.name);
  const setBranches = (rules: BranchRule[]) => {
    setDirty(true);
    setDefinition((current) => ({
      ...current,
      branchesByScreen: {
        ...(current.branchesByScreen ?? {}),
        [screen.id]: rules,
      },
    }));
  };
  const addBranch = () => {
    const field = fieldBlocks[0];
    const destination = definition.screens.find((item) => item.id !== screen.id);
    if (!field || !destination) return;
    const firstOption = field.options?.[0]?.id ?? "";
    setBranches([
      ...activeBranches,
      {
        field: field.name!,
        op: "equals",
        value: firstOption,
        next: destination.id,
      },
    ]);
    update({ final: false });
  };
  const updateBranch = (index: number, patch: Partial<BranchRule>) =>
    setBranches(
      activeBranches.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  const deleteScreen = () => {
    setDirty(true);
    if (definition.screens.length === 1) {
      update({ text: "" });
      return;
    }
    const removedId = screen?.id;
    setDefinition((current) => ({
      ...current,
      branchesByScreen: Object.fromEntries(
        Object.entries(current.branchesByScreen ?? {})
          .filter(([screenId]) => screenId !== removedId)
          .map(([screenId, rules]) => [
            screenId,
            rules.map((rule) =>
              rule.next === removedId ? { ...rule, next: null } : rule,
            ),
          ]),
      ),
      screens: current.screens
        .filter((_, index) => index !== active)
        .map((item, index, screens) => ({
          ...item,
          next:
            item.next === removedId
              ? (screens[index + 1]?.id ?? null)
              : item.next,
          final: index === screens.length - 1 ? true : item.final,
        })),
    }));
    setActive((current) => Math.max(0, current - 1));
  };
  return (
    <div className="pb-20">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[.14em] text-zinc-500">
            Templates / MiniApps / Builder
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-heading-1">Editor de MiniApp</h1>
            <span className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-semibold">
              Rascunho
            </span>
          </div>
          <p className="mt-1 max-w-[305px] text-body-sm sm:max-w-none">
            MiniApp é uma experiência por telas. Edite conteúdo e navegação sem
            precisar alternar modos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
            onClick={() => navigate("/templates?tab=flows")}
          >
            Lista
          </button>
        </div>
      </div>
      {save.isSuccess && (
        <div className="fixed right-6 top-6 z-50 flex w-80 items-center gap-2 rounded-lg border border-primary-900 bg-primary-950 p-4 text-sm text-primary-300">
          <Check size={16} /> MiniApp salva
        </div>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
        <div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {["Começar", "Conteúdo", "Finalizar"].map((label, i) => (
              <button
                key={label}
                onClick={() => setStep(i + 1)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${step === i + 1 ? "border-primary-500/50 bg-primary-500/10" : "border-zinc-800 bg-zinc-900/50"}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-xs">
                  {i + 1}
                </span>
                <span className="text-xs uppercase tracking-[.15em]">
                  {label}
                </span>
              </button>
            ))}
          </div>
          <Card className="mt-4 p-6">
            {step === 1 ? (
              <StartStep
                name={name}
                generating={generateWithAI.isPending}
                generationError={generateWithAI.error?.message}
                setName={(value) => {
                  setName(value);
                  setDirty(true);
                }}
                onCreateFromAI={async (prompt) => {
                  const generated = await generateWithAI.mutateAsync(prompt);
                  setDefinition(generated.definition);
                  setMapping({});
                  setActive(0);
                  setDirty(true);
                  setStep(2);
                }}
                onApplyTemplate={(template) => {
                  setDefinition(structuredClone(template.definition));
                  setMapping(structuredClone(template.mapping));
                  setActive(0);
                  setDirty(true);
                  setStep(2);
                }}
                onCreateFromZero={() => {
                  setDefinition({ version: "7.3", screens: [baseScreen(name || "MiniApp")] });
                  setMapping({});
                  setActive(0);
                  setDirty(true);
                  setStep(2);
                }}
              />
            ) : step === 3 ? (
              <FinishStep
                flow={query.data!}
                name={name}
                onNameChange={(value) => {
                  setName(value);
                  setDirty(true);
                }}
                definition={definition}
                mapping={mapping}
                onDefinitionChange={(next) => {
                  setDefinition(next);
                  setDirty(true);
                }}
                onMappingChange={(next) => {
                  setMapping(next);
                  setDirty(true);
                }}
                onSave={() => save.mutate()}
                onPublish={() => publish.mutate()}
                saving={save.isPending}
                publishing={publish.isPending}
                publishError={publish.error?.message}
                publishSuccess={publish.isSuccess}
              />
            ) : screen ? (
              <>
                <div className="rounded-2xl border border-zinc-800 p-4">
                  <h2 className="font-medium">Editar</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Clique em um texto, pergunta ou botão no preview para
                    editar.
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Telas</h2>
                    <p className="text-xs text-zinc-500">
                      Monte o conteúdo de cada tela e escolha para onde o botão
                      vai.
                    </p>
                  </div>
                  <span className="relative flex items-center gap-3 text-xs text-zinc-500">
                    {save.isPending
                      ? "Salvando…"
                      : save.isError
                        ? save.error.message
                      : save.isSuccess
                        ? "Salvo"
                        : dirty
                          ? "Rascunho local"
                          : "Salvo"}
                    <button
                      type="button"
                      aria-label="Ações"
                      aria-expanded={screenMenuOpen}
                      onClick={() => setScreenMenuOpen((open) => !open)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 text-zinc-300"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {screenMenuOpen && (
                      <span className="absolute right-0 top-11 z-30 w-[min(20rem,calc(100vw-2rem))] min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 p-1 text-left text-sm text-zinc-200 shadow-2xl">
                        <button
                          type="button"
                          onClick={addScreen}
                          disabled={definition.screens.length >= 10}
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Adicionar tela
                        </button>
                        <button
                          type="button"
                          disabled={definition.screens.length <= 1}
                          onClick={() => {
                            deleteScreen();
                            setScreenMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-red-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          Remover tela
                        </button>
                        <span className="my-1 block border-t border-zinc-800" />
                        <button
                          type="button"
                          onClick={() => {
                            setAdvancedOpen(true);
                            setScreenMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800"
                        >
                          Ajustes avançados
                        </button>
                        <span className="my-1 block border-t border-zinc-800" />
                        <button
                          type="button"
                          disabled={save.isPending}
                          onClick={() => {
                            save.mutate();
                            setScreenMenuOpen(false);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-800"
                        >
                          Salvar agora
                        </button>
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {definition.screens.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => setActive(index)}
                      className={`rounded-lg border px-3 py-2 text-xs ${active === index ? "border-zinc-600 bg-zinc-800" : "border-zinc-800"}`}
                    >
                      {item.title}
                    </button>
                  ))}
                  <button
                    onClick={addScreen}
                    className="rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="mt-4 rounded-2xl border border-zinc-800 p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                    <label className="text-xs uppercase tracking-widest text-zinc-500">
                      Título da tela
                      <input
                        value={screen.title}
                        onChange={(e) => update({ title: e.target.value })}
                        maxLength={80}
                        className={`mt-2 ${inputClass}`}
                      />
                    </label>
                    <button
                      onClick={() =>
                        update({ final: !screen.final, next: null })
                      }
                      className="flex items-center justify-between rounded-xl border border-zinc-800 p-3 text-left"
                    >
                      <span>
                        <span className="block text-sm">Tela final</span>
                        <span className="text-[11px] text-zinc-500">
                          O botão vira “Concluir”
                        </span>
                      </span>
                      <span
                        className={`h-5 w-9 rounded-full ${screen.final ? "bg-primary-500" : "bg-zinc-700"}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="my-6 border-t border-zinc-800" />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Conteúdo</h3>
                  <div className="relative">
                    <button
                      type="button"
                      aria-expanded={addMenuOpen}
                      disabled={blocks.length >= 48}
                      onClick={() => setAddMenuOpen((open) => !open)}
                      className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={15} /> Adicionar <ChevronDown size={15} />
                    </button>
                    {addMenuOpen && (
                      <div className="absolute right-0 top-11 z-30 max-h-80 min-w-64 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
                        {blockOptions.map((option) => (
                          <button
                            type="button"
                            key={option.key}
                            disabled={option.type === "OptIn" && blocks.filter((block) => block.type === "OptIn").length >= 5}
                            onClick={() =>
                              addBlock(option.type, option.inputType)
                            }
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 divide-y divide-zinc-800">
                  {blocks.map((block, index) => (
                    <BlockEditor
                      key={block.id}
                      block={block}
                      selected={selectedBlockId === block.id}
                      onSelect={() => setSelectedBlockId(block.id)}
                      index={index}
                      count={blocks.length}
                      onChange={(patch) => updateBlock(index, patch)}
                      onMove={(direction) => moveBlock(index, direction)}
                      onDelete={() =>
                        blocks.length === 1
                          ? updateBlock(index, { text: "", label: "" })
                          : patchBlocks(
                              blocks.filter(
                                (_, blockIndex) => blockIndex !== index,
                              ),
                            )
                      }
                    />
                  ))}
                </div>
                <div className="mt-8 rounded-2xl border border-zinc-800 p-4">
                  <h3 className="text-sm font-semibold">Botão</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-xs uppercase tracking-widest text-zinc-500">
                      Texto do botão
                      <input
                        value={screen.buttonText}
                        onChange={(e) => update({ buttonText: e.target.value })}
                        maxLength={35}
                        className={`mt-2 ${inputClass}`}
                      />
                    </label>
                    <label className="text-xs uppercase tracking-widest text-zinc-500">
                      Próxima tela
                      <select
                        value={screen.next || ""}
                        disabled={screen.final}
                        onChange={(e) =>
                          update({ next: e.target.value || null })
                        }
                        className={`mt-2 ${inputClass}`}
                      >
                        <option value="">— Concluir —</option>
                        {definition.screens
                          .filter((s) => s.id !== screen.id)
                          .map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Caminhos</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Decida para onde ir depois do botão, com ou sem ramificações.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={addBranch}
                      disabled={fieldBlocks.length === 0 || definition.screens.length < 2}
                    >
                      <Plus size={15} /> Adicionar regra
                    </button>
                  </div>
                  {fieldBlocks.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400">
                      Adicione um campo (ex.: texto, lista ou escolha) para criar ramificações.
                    </p>
                  ) : definition.screens.length < 2 ? (
                    <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400">
                      Adicione outra tela para definir um destino.
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs uppercase tracking-widest text-zinc-500">
                      Destino padrão
                      <select
                        value={screen.next ?? ""}
                        onChange={(event) =>
                          update({
                            next: event.target.value || null,
                            final: !event.target.value && activeBranches.length === 0,
                          })
                        }
                        className={`mt-2 ${inputClass}`}
                      >
                        <option value="">— Concluir —</option>
                        {definition.screens
                          .filter((item) => item.id !== screen.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-3">
                      <p className="text-xs font-medium text-zinc-300">Quando uma regra casar</p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        O primeiro caminho que casar ganha.
                      </p>
                    </div>
                  </div>
                  {activeBranches.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {activeBranches.map((rule, index) => {
                        const selectedField = fieldBlocks.find(
                          (block) => block.name === rule.field,
                        );
                        const choiceOptions = selectedField?.options ?? [];
                        const needsValue = ["equals", "contains", "gt", "lt"].includes(rule.op);
                        return (
                          <div
                            key={`${screen.id}-branch-${index}`}
                            className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"
                          >
                            <div className="grid gap-2 lg:grid-cols-[1fr_150px_1fr_190px_auto] lg:items-end">
                              <label className="text-xs uppercase tracking-widest text-zinc-500">
                                Campo
                                <select
                                  value={rule.field}
                                  onChange={(event) => {
                                    const field = fieldBlocks.find(
                                      (block) => block.name === event.target.value,
                                    );
                                    updateBranch(index, {
                                      field: event.target.value,
                                      value: field?.options?.[0]?.id ?? "",
                                    });
                                  }}
                                  className={`mt-2 ${inputClass}`}
                                >
                                  {fieldBlocks.map((block) => (
                                    <option key={block.id} value={block.name}>
                                      {block.label || block.text || block.name} ({block.name})
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs uppercase tracking-widest text-zinc-500">
                                Operador
                                <select
                                  value={rule.op}
                                  onChange={(event) =>
                                    updateBranch(index, {
                                      op: event.target.value as BranchRule["op"],
                                    })
                                  }
                                  className={`mt-2 ${inputClass}`}
                                >
                                  <option value="is_filled">preenchido</option>
                                  <option value="is_empty">vazio</option>
                                  <option value="equals">é igual a</option>
                                  <option value="contains">contém</option>
                                  <option value="gt">maior que</option>
                                  <option value="lt">menor que</option>
                                  <option value="is_true">é verdadeiro</option>
                                  <option value="is_false">é falso</option>
                                </select>
                              </label>
                              <label className="text-xs uppercase tracking-widest text-zinc-500">
                                Valor
                                {choiceOptions.length > 0 && ["equals", "contains"].includes(rule.op) ? (
                                  <select
                                    value={needsValue ? rule.value : ""}
                                    disabled={!needsValue}
                                    onChange={(event) => updateBranch(index, { value: event.target.value })}
                                    className={`mt-2 ${inputClass}`}
                                  >
                                    {choiceOptions.map((option) => (
                                      <option key={option.id} value={option.id}>{option.title}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={needsValue ? rule.value : ""}
                                    disabled={!needsValue}
                                    placeholder={needsValue ? "valor…" : "—"}
                                    onChange={(event) => updateBranch(index, { value: event.target.value })}
                                    className={`mt-2 ${inputClass}`}
                                  />
                                )}
                              </label>
                              <label className="text-xs uppercase tracking-widest text-zinc-500">
                                Destino
                                <select
                                  value={rule.next ?? ""}
                                  onChange={(event) => updateBranch(index, { next: event.target.value || null })}
                                  className={`mt-2 ${inputClass}`}
                                >
                                  <option value="">— Concluir —</option>
                                  {definition.screens
                                    .filter((item) => item.id !== screen.id)
                                    .map((item) => (
                                      <option key={item.id} value={item.id}>{item.title}</option>
                                    ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                aria-label="Remover regra"
                                onClick={() => setBranches(activeBranches.filter((_, ruleIndex) => ruleIndex !== index))}
                                className="h-11 rounded-xl border border-red-900 p-3 text-red-400"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    className={btnPrimary}
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                  >
                    Salvar MiniApp
                  </button>
                </div>
              </>
            ) : null}
          </Card>
        </div>
        <FlowPreview
          name={name}
          screen={screen}
          selectedBlockId={selectedBlockId}
          onSelectBlock={(blockId) => {
            setSelectedBlockId(blockId);
            requestAnimationFrame(() =>
              document
                .querySelector(`[data-flow-block-id="${CSS.escape(blockId)}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" }),
            );
          }}
          onAdvance={(values) => {
            const branch = activeBranches.find((rule) =>
              previewRuleMatches(rule, values[rule.field]),
            );
            // A regra encontrada é soberana: destino vazio significa concluir,
            // não cair silenciosamente no destino padrão da tela.
            const target = branch ? branch.next : screen?.next;
            if (!target) return false;
            const next = definition.screens.findIndex(
              (item) => item.id === target,
            );
            if (next >= 0) setActive(next);
            return next >= 0;
          }}
        />
      </div>
      {advancedOpen && (
        <AdvancedFlowPanel
          definition={definition}
          active={active}
          onActiveChange={setActive}
          onChange={(next) => {
            setDefinition(next);
            setDirty(true);
          }}
          onClose={() => setAdvancedOpen(false)}
        />
      )}
    </div>
  );
}
function StartStep({
  name,
  setName,
  generating,
  generationError,
  onCreateFromAI,
  onApplyTemplate,
  onCreateFromZero,
}: {
  name: string;
  setName: (v: string) => void;
  generating: boolean;
  generationError?: string;
  onCreateFromAI: (prompt: string) => Promise<void>;
  onApplyTemplate: (template: (typeof FLOW_TEMPLATES)[number]) => void;
  onCreateFromZero: () => void;
}) {
  const [mode, setMode] = useState<"ai" | "template" | "zero" | null>(null);
  const [prompt, setPrompt] = useState("");
  const [templateKey, setTemplateKey] = useState(FLOW_TEMPLATES[0]?.key ?? "");
  const selectedTemplate = FLOW_TEMPLATES.find((item) => item.key === templateKey);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Como quer começar?</h2>
        <p className="mt-1 text-sm text-zinc-500">Escolha uma opção para criar sua MiniApp.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { id: "ai" as const, icon: Wand2, title: "Criar com IA", text: "Descreva o que precisa e a IA monta as perguntas." },
          { id: "template" as const, icon: LayoutTemplate, title: "Usar modelo pronto", text: "Escolha um template e personalize." },
          { id: "zero" as const, icon: PenSquare, title: "Criar do zero", text: "Comece com a primeira pergunta." },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={mode === option.id}
            onClick={() => setMode(option.id)}
            className={`rounded-2xl border p-4 text-left transition ${mode === option.id ? "border-primary-500/60 bg-primary-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"}`}
          >
            <span className="flex items-center gap-2 font-semibold"><option.icon size={16} /> {option.title}</span>
            <span className="mt-2 block text-xs leading-relaxed text-zinc-400">{option.text}</span>
          </button>
        ))}
      </div>
      <label className="block text-xs text-zinc-400">
        Nome do MiniApp
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {mode === "ai" && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div><h3 className="font-semibold">Criar com IA</h3><p className="mt-1 text-xs text-zinc-500">Descreva o que você quer coletar.</p></div>
          <textarea
            aria-label="O que você quer coletar"
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder='Ex.: "Quero um pré-cadastro com nome, telefone, e-mail e cidade."'
            className={inputClass}
          />
          {generationError && <p role="alert" className="text-sm text-red-300">{generationError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={generating} onClick={() => setMode(null)}>Cancelar</button>
            <button type="button" className={btnPrimary} disabled={generating || prompt.trim().length < 10} onClick={() => { void onCreateFromAI(prompt.trim()).catch(() => undefined); }}>{generating ? "Gerando…" : "Gerar MiniApp"}</button>
          </div>
        </div>
      )}
      {mode === "template" && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div><h3 className="font-semibold">Usar modelo pronto</h3><p className="mt-1 text-xs text-zinc-500">Selecione um modelo para substituir o conteúdo atual.</p></div>
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {FLOW_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                disabled={Boolean(template.unavailableReason)}
                onClick={() => setTemplateKey(template.key)}
                className={`rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${templateKey === template.key ? "border-primary-500 bg-primary-500/10" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"}`}
              >
                <span className="block text-sm font-semibold">{template.name}</span>
                <span className="mt-1 block text-xs text-zinc-400">{template.description}</span>
                {template.dynamic && <span className="mt-2 inline-flex rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] text-primary-300">Dinâmico</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setMode(null)}>Cancelar</button>
            <button type="button" className={btnPrimary} disabled={!selectedTemplate || Boolean(selectedTemplate.unavailableReason)} onClick={() => selectedTemplate && onApplyTemplate(selectedTemplate)}>Usar modelo</button>
          </div>
        </div>
      )}
      {mode === "zero" && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold">Criar do zero</h3><p className="mt-1 text-xs text-zinc-500">O conteúdo atual será substituído por uma primeira tela vazia.</p></div>
          <div className="flex gap-2"><button type="button" className={btnSecondary} onClick={() => setMode(null)}>Cancelar</button><button type="button" className={btnPrimary} onClick={onCreateFromZero}>Começar do zero</button></div>
        </div>
      )}
    </div>
  );
}

function AdvancedFlowPanel({
  definition,
  active,
  onActiveChange,
  onChange,
  onClose,
}: {
  definition: Definition;
  active: number;
  onActiveChange: (index: number) => void;
  onChange: (definition: Definition) => void;
  onClose: () => void;
}) {
  const screen = definition.screens[active];
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const patchScreen = (patch: Partial<Screen>) => {
    if (!screen) return;
    const previousId = screen.id;
    const nextId = patch.id ?? previousId;
    const idChanged = nextId !== previousId;
    onChange({
      ...definition,
      screens: definition.screens.map((item, index) => ({
        ...(index === active ? { ...item, ...patch } : item),
        next: item.next === previousId && idChanged ? nextId : item.next,
      })),
      branchesByScreen: Object.fromEntries(
        Object.entries(definition.branchesByScreen ?? {}).map(([screenId, rules]) => [
          screenId === previousId && idChanged ? nextId : screenId,
          rules.map((rule) => ({
            ...rule,
            next: rule.next === previousId && idChanged ? nextId : rule.next,
          })),
        ]),
      ),
    });
  };
  const add = () => {
    if (definition.screens.length >= 10) return;
    const next = baseScreen(`Tela ${definition.screens.length + 1}`);
    onChange({ ...definition, screens: [...definition.screens, next] });
    onActiveChange(definition.screens.length);
  };
  const remove = () => {
    if (definition.screens.length <= 1) return;
    const removedId = screen.id;
    const screens = definition.screens.filter((_, index) => index !== active).map((item) => ({ ...item, next: item.next === removedId ? null : item.next }));
    onChange({ ...definition, screens, branchesByScreen: Object.fromEntries(Object.entries(definition.branchesByScreen ?? {}).filter(([id]) => id !== removedId)) });
    onActiveChange(Math.max(0, active - 1));
  };
  return (
    <div className="fixed inset-0 z-[90] bg-black/60" role="dialog" aria-modal="true" aria-label="Ajustes avançados" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-[600px] flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 p-4">
          <div><h2 className="text-lg font-semibold">Modo Avançado</h2><p className="text-xs text-zinc-400">Manutenção estrutural das telas e rotas.</p></div>
          <button type="button" className={btnSecondary} onClick={onClose}><X size={16} /> Fechar</button>
        </header>
        <div className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Telas</h3><button type="button" className={btnPrimary} disabled={definition.screens.length >= 10} onClick={add}><Plus size={15} /> Adicionar tela</button></div>
          <div className="flex flex-wrap gap-2">{definition.screens.map((item, index) => <button type="button" key={item.id} onClick={() => onActiveChange(index)} className={`rounded-full border px-3 py-1 text-xs ${index === active ? "border-primary-500 bg-primary-500/10 text-primary-200" : "border-zinc-800 text-zinc-300"}`}>{item.id}</button>)}</div>
          {screen && <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <label className="block text-xs uppercase tracking-widest text-zinc-500">Screen ID<input value={screen.id} onChange={(event) => patchScreen({ id: slug(event.target.value).toUpperCase() })} className={`mt-2 ${inputClass}`} /></label>
            <label className="block text-xs uppercase tracking-widest text-zinc-500">Título<input value={screen.title} maxLength={80} onChange={(event) => patchScreen({ title: event.target.value })} className={`mt-2 ${inputClass}`} /></label>
            <button type="button" onClick={() => patchScreen({ final: !screen.final, next: screen.final ? screen.next : null })} className="flex w-full items-center justify-between rounded-xl border border-zinc-800 p-3 text-left"><span><span className="block text-sm">Terminal</span><span className="text-[11px] text-zinc-500">Marca a última tela do flow</span></span><span className={`h-5 w-9 rounded-full ${screen.final ? "bg-primary-500" : "bg-zinc-700"}`} /></button>
            <label className="block text-xs uppercase tracking-widest text-zinc-500">Ir para<select value={screen.next ?? ""} disabled={screen.final} onChange={(event) => patchScreen({ next: event.target.value || null })} className={`mt-2 ${inputClass}`}><option value="">— Nenhuma (terminal) —</option>{definition.screens.filter((item) => item.id !== screen.id).map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
            <div className="flex justify-end"><button type="button" className="inline-flex items-center gap-2 rounded-xl border border-red-900 px-4 py-2 text-sm text-red-300 disabled:opacity-40" disabled={definition.screens.length <= 1} onClick={remove}><Trash2 size={15} /> Remover tela</button></div>
          </div>}
        </div>
      </aside>
    </div>
  );
}
function BlockEditor({
  block,
  selected,
  onSelect,
  index,
  count,
  onChange,
  onMove,
  onDelete,
}: {
  block: FlowBlock;
  selected: boolean;
  onSelect: () => void;
  index: number;
  count: number;
  onChange: (patch: Partial<FlowBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const textBlock =
    ["TextHeading", "TextSubheading", "TextBody", "TextCaption"].includes(
      block.type,
    ) || block.type === "OptIn";
  const label =
    blockOptions.find(
      (option) =>
        option.type === block.type &&
        (!option.inputType || option.inputType === block.inputType),
    )?.label ?? block.type;
  const hasOptions = [
    "Dropdown",
    "RadioButtonsGroup",
    "CheckboxGroup",
  ].includes(block.type);
  return (
    <div
      data-flow-block-id={block.id}
      onFocusCapture={onSelect}
      onClick={onSelect}
      className={`rounded-xl px-3 py-5 first:pt-4 ${selected ? "bg-primary-500/5 ring-1 ring-primary-500/60" : ""}`}
    >
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-xs uppercase tracking-widest text-zinc-500">
            {label}
            {textBlock ? (
              <textarea
                rows={block.type === "TextHeading" ? 2 : 3}
                value={block.text ?? ""}
                maxLength={flowTextLimits[block.type]}
                onChange={(event) => onChange({ text: event.target.value })}
                className={`mt-2 ${inputClass}`}
              />
            ) : (
              <input
                value={block.label ?? ""}
                maxLength={flowLabelLimits[block.type]}
                onChange={(event) => onChange({ label: event.target.value })}
                className={`mt-2 ${inputClass}`}
              />
            )}
          </label>
          {!textBlock && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-widest text-zinc-500">
                Nome do campo
                <input
                  value={block.name ?? ""}
                  maxLength={48}
                  onChange={(event) =>
                    onChange({ name: slug(event.target.value) })
                  }
                  className={`mt-2 ${inputClass}`}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange({ required: !block.required })}
                className="mt-5 flex h-11 items-center justify-between rounded-xl border border-zinc-800 px-3 text-left text-sm"
              >
                Obrigatório
                <span
                  className={`h-5 w-9 rounded-full ${block.required ? "bg-primary-500" : "bg-zinc-700"}`}
                />
              </button>
            </div>
          )}
          {hasOptions && (
            <label className="mt-3 block text-xs uppercase tracking-widest text-zinc-500">
              Opções, uma por linha
              <textarea
                rows={3}
                value={(block.options ?? [])
                  .map((option) => option.title)
                  .join("\n")}
                onChange={(event) => {
                  const limit = flowOptionLimits[block.type] ?? 20;
                  onChange({
                    options: event.target.value
                      .split("\n")
                      .map((title) => title.trim().slice(0, 30))
                      .filter(Boolean)
                      .slice(0, limit)
                      .map((title, optionIndex) => ({
                        id: `opcao_${optionIndex + 1}`,
                        title,
                      })),
                  });
                }}
                className={`mt-2 ${inputClass}`}
              />
              <span className="mt-1 block normal-case tracking-normal text-zinc-600">
                Até {flowOptionLimits[block.type] ?? 20} opções, com 30 caracteres por opção.
              </span>
            </label>
          )}
        </div>
        <div className="flex gap-2 pb-0.5">
          <button
            type="button"
            aria-label="Mover bloco para cima"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="h-10 rounded-xl border border-zinc-800 p-3 text-zinc-400 disabled:opacity-30"
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            aria-label="Mover bloco para baixo"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="h-10 rounded-xl border border-zinc-800 p-3 text-zinc-400 disabled:opacity-30"
          >
            <ArrowDown size={15} />
          </button>
          <button
            type="button"
            aria-label="Excluir bloco"
            onClick={onDelete}
            className="h-10 rounded-xl border border-red-900 p-3 text-red-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
function FinishStep({
  flow,
  name,
  onNameChange,
  definition,
  mapping,
  onDefinitionChange,
  onMappingChange,
  onSave,
  onPublish,
  saving,
  publishing,
  publishError,
  publishSuccess,
}: {
  flow: Flow;
  name: string;
  onNameChange: (value: string) => void;
  definition: Definition;
  mapping: FlowMapping;
  onDefinitionChange: (definition: Definition) => void;
  onMappingChange: (mapping: FlowMapping) => void;
  onSave: () => void;
  onPublish: () => void;
  saving: boolean;
  publishing: boolean;
  publishError?: string;
  publishSuccess: boolean;
}) {
  const published = flow.status === "PUBLISHED";
  const [testPhone, setTestPhone] = useState("");
  const [testBody, setTestBody] = useState("Vamos começar?");
  const [testCta, setTestCta] = useState("Abrir");
  const [testFooter, setTestFooter] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; messageId: string } | { ok: false; error: string } | null
  >(null);
  const validationCount = Array.isArray(flow.validationErrors)
    ? flow.validationErrors.length
    : flow.validationErrors
      ? 1
      : 0;
  const fields = definition.screens.flatMap((screen) =>
    (screen.blocks ?? [])
      .filter((block) => Boolean(block.name))
      .map((block) => ({ name: block.name!, label: block.label || block.name! })),
  );
  const customFieldsQuery = useQuery({
    queryKey: ["contacts", "custom-fields"],
    queryFn: () =>
      api<{ items: Array<{ id: string; key: string; label: string }> }>(
        "/api/contacts/custom-fields",
      ),
  });
  const confirmation = definition.confirmation ?? {};
  const patchConfirmation = (patch: Partial<NonNullable<Definition["confirmation"]>>) =>
    onDefinitionChange({
      ...definition,
      confirmation: { ...confirmation, ...patch },
    });
  return (
    <div>
      <h2 className="text-lg font-semibold">Finalizar</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Revise e publique o MiniApp na Meta.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <label className="min-w-0 flex-1 text-xs uppercase tracking-widest text-zinc-500">
            Nome do MiniApp
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-400">
            {flow.status === "PUBLISHED"
              ? "Publicado"
              : flow.status === "ACTION_REQUIRED"
                ? "Requer correção"
                : "Rascunho"}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Após publicar, alterações exigem uma nova versão.
        </p>
        {flow.meta_id && (
          <p className="mt-3 text-[11px] text-zinc-500">
            ID Meta: <span className="font-mono">{flow.meta_id}</span>
          </p>
        )}
        {validationCount > 0 && (
          <p className="mt-3 text-xs text-amber-300">
            A Meta encontrou {validationCount} validação
            {validationCount === 1 ? "" : "ões"} que precisa
            {validationCount === 1 ? "" : "m"} de correção.
          </p>
        )}
      </div>
      {fields.length > 0 && (
        <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Mapeamento do contato</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Use as respostas para atualizar o contato e seus campos personalizados.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FlowFieldSelect
              label="Nome do contato"
              value={mapping.contact?.nameField || ""}
              fields={fields}
              onChange={(nameField) =>
                onMappingChange({ ...mapping, contact: { ...mapping.contact, nameField } })
              }
            />
            <FlowFieldSelect
              label="E-mail do contato"
              value={mapping.contact?.emailField || ""}
              fields={fields}
              onChange={(emailField) =>
                onMappingChange({ ...mapping, contact: { ...mapping.contact, emailField } })
              }
            />
          </div>
          {(customFieldsQuery.data?.items ?? []).length > 0 && (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-zinc-300">Campos personalizados</p>
              <div className="grid gap-3 md:grid-cols-2">
                {customFieldsQuery.data!.items.map((field) => (
                  <FlowFieldSelect
                    key={field.id}
                    label={field.label}
                    value={mapping.customFields?.[field.id] || ""}
                    fields={fields}
                    onChange={(responseField) =>
                      onMappingChange({
                        ...mapping,
                        customFields: {
                          ...(mapping.customFields ?? {}),
                          [field.id]: responseField,
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {fields.length > 0 && (
        <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-zinc-950/30 p-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2">
            <div>
              <h3 className="text-xs font-medium text-zinc-300">Enviar confirmação ao usuário</h3>
              <p className="mt-1 text-[11px] text-zinc-500">Mostra um resumo das respostas após finalizar</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={confirmation.enabled !== false}
              onClick={() => patchConfirmation({ enabled: confirmation.enabled === false })}
              className={`relative h-6 w-12 rounded-full border border-white/10 transition ${confirmation.enabled === false ? "bg-white/5" : "bg-primary-500/40"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${confirmation.enabled === false ? "left-0.5 opacity-40" : "left-[26px]"}`} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-zinc-300">
              Título (opcional)
              <input
                value={confirmation.title || ""}
                onChange={(event) => patchConfirmation({ title: event.target.value })}
                placeholder="Resposta registrada ✅"
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-300">
              Rodapé (opcional)
              <input
                value={confirmation.footer || ""}
                onChange={(event) => patchConfirmation({ footer: event.target.value })}
                placeholder="Qualquer ajuste, responda esta mensagem."
                className={`mt-2 ${inputClass}`}
              />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-300">Campos no resumo</p>
            <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-white/10 bg-zinc-950/40 p-3">
              {fields.map((field) => {
                const selected = confirmation.fields?.includes(field.name) ?? true;
                return (
                  <label key={field.name} className="flex items-center gap-3 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const current = confirmation.fields ?? fields.map((item) => item.name);
                        patchConfirmation({
                          fields: event.target.checked
                            ? Array.from(new Set([...current, field.name]))
                            : current.filter((name) => name !== field.name),
                        });
                      }}
                    />
                    <input
                      value={confirmation.labels?.[field.name] || field.label}
                      onChange={(event) =>
                        patchConfirmation({
                          labels: { ...(confirmation.labels ?? {}), [field.name]: event.target.value },
                        })
                      }
                      className={inputClass}
                    />
                    <span className="font-mono text-[10px] text-zinc-600">{field.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className={btnSecondary}
          onClick={onSave}
          disabled={saving || publishing}
        >
          {saving ? "Salvando…" : "Salvar rascunho"}
        </button>
        {!published && (
          <button
            className={btnPrimary}
            onClick={onPublish}
            disabled={saving || publishing}
          >
            {publishing ? "Publicando na Meta…" : "Publicar na Meta"}
          </button>
        )}
        {flow.meta_preview_url && (
          <a
            className={btnSecondary}
            href={flow.meta_preview_url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir preview da Meta
          </a>
        )}
      </div>
      {publishError && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {publishError}
        </p>
      )}
      {publishSuccess && (
        <p role="status" className="mt-4 text-sm text-primary-300">
          MiniApp publicado e sincronizado com a Meta.
        </p>
      )}
      {published && !flow.meta_preview_url && (
        <p className="mt-4 text-xs text-zinc-500">
          Este MiniApp está publicado e não pode mais ser editado na Meta.
        </p>
      )}
      {published && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div>
            <h3 className="text-base font-semibold text-white">3. Testar</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Envie um MiniApp real para validar a experiência.
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            <label className="text-xs font-medium text-zinc-300">
              Telefone (to)
              <input
                aria-label="Telefone (to)"
                value={testPhone}
                onChange={(event) => setTestPhone(event.target.value)}
                placeholder="Ex.: +5511999999999"
                className={`mt-2 ${inputClass}`}
              />
              <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                Em produção, somente o número autorizado para testes é aceito.
              </span>
            </label>
            <label className="text-xs font-medium text-zinc-300">
              Texto da mensagem
              <textarea
                aria-label="Texto da mensagem"
                rows={2}
                value={testBody}
                onChange={(event) => setTestBody(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-300">
              Texto do botão
              <input
                aria-label="Texto do botão"
                value={testCta}
                onChange={(event) => setTestCta(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-medium text-zinc-300">
              Rodapé (opcional)
              <input
                aria-label="Rodapé (opcional)"
                value={testFooter}
                onChange={(event) => setTestFooter(event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={btnPrimary}
              disabled={sendingTest || !testPhone.trim() || !testBody.trim() || !testCta.trim()}
              onClick={async () => {
                setSendingTest(true);
                setTestResult(null);
                try {
                  const result = await api<{ ok: true; messageId: string }>(
                    `/api/flows/${flow.id}/send`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        to: testPhone,
                        body: testBody,
                        ctaText: testCta,
                        ...(testFooter.trim() ? { footer: testFooter } : {}),
                      }),
                    },
                  );
                  setTestResult(result);
                } catch (error) {
                  setTestResult({
                    ok: false,
                    error: error instanceof Error ? error.message : "Falha ao enviar MiniApp",
                  });
                } finally {
                  setSendingTest(false);
                }
              }}
            >
              <Send size={15} /> {sendingTest ? "Enviando…" : "Enviar teste"}
            </button>
            <span className="text-[11px] text-zinc-500">
              As respostas aparecem em “Submissões”.
            </span>
          </div>
          {testResult?.ok && (
            <p role="status" className="mt-3 text-sm text-primary-300">
              MiniApp enviado com sucesso.
            </p>
          )}
          {testResult && !testResult.ok && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {testResult.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function FlowFieldSelect({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: Array<{ name: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-zinc-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 ${inputClass}`}
      >
        <option value="">Não mapear</option>
        {fields.map((field) => (
          <option key={field.name} value={field.name}>
            {field.label} ({field.name})
          </option>
        ))}
      </select>
    </label>
  );
}
function FlowPreview({
  name,
  screen,
  selectedBlockId,
  onSelectBlock,
  onAdvance,
}: {
  name: string;
  screen?: Screen;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onAdvance: (values: Record<string, PreviewValue>) => boolean;
}) {
  const [values, setValues] = useState<Record<string, PreviewValue>>({});
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    setValues({});
    setInvalidFields([]);
    setSubmitted(false);
  }, [screen?.id]);
  const setValue = (name: string, value: PreviewValue) => {
    setValues((current) => ({ ...current, [name]: value }));
    setInvalidFields((current) => current.filter((field) => field !== name));
  };
  return (
    <Card className="h-fit p-4">
      <p className="text-xs uppercase tracking-widest text-zinc-500">Resumo</p>
      <h2 className="mt-1 text-lg font-semibold">Prévia</h2>
      <div data-testid="flow-preview" className="mx-auto mt-5 flex h-[630px] max-w-[320px] flex-col rounded-[42px] border-[8px] border-zinc-900 bg-[#222729] p-4 shadow-2xl">
        <div className="truncate border-b border-zinc-700 pb-4 text-lg font-semibold">
          × &nbsp; {name || "MiniApp"} &nbsp; ⋮
        </div>
        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
          {submitted ? (
            <div role="status" className="rounded-xl border border-primary-500/40 bg-primary-500/10 p-4 text-center">
              <p className="font-semibold text-primary-200">Simulação concluída</p>
              <p className="mt-1 text-xs text-zinc-300">Os dados foram preenchidos apenas nesta prévia.</p>
              <button type="button" onClick={() => setSubmitted(false)} className="mt-3 text-xs font-medium text-primary-300 underline">
                Reiniciar prévia
              </button>
            </div>
          ) : (
          (screen?.blocks?.length
            ? screen.blocks
            : screen
              ? [
                  {
                    id: "preview-text",
                    type: "TextBody" as const,
                    text: screen.text,
                  },
                ]
              : []
          ).map((block) => {
            const selectionClass = selectedBlockId === block.id
              ? "rounded-lg ring-2 ring-primary-400/80"
              : "rounded-lg hover:ring-1 hover:ring-primary-400/50";
            const select = () => onSelectBlock(block.id);
            return (
            block.type === "TextHeading" ? (
              <h3 key={block.id} onClick={select} className={`cursor-pointer text-xl font-semibold ${selectionClass}`}>
                {block.text}
              </h3>
            ) : block.type === "TextSubheading" ? (
              <h4 key={block.id} onClick={select} className={`cursor-pointer text-base font-semibold ${selectionClass}`}>
                {block.text}
              </h4>
            ) : block.type === "TextCaption" ? (
              <p key={block.id} onClick={select} className={`cursor-pointer text-xs text-zinc-400 ${selectionClass}`}>
                {block.text}
              </p>
            ) : block.type === "TextBody" ? (
              <p key={block.id} onClick={select} className={`cursor-pointer ${selectionClass}`}>{block.text}</p>
            ) : block.type === "OptIn" ? (
              <label key={block.id} onClick={select} className={`flex cursor-pointer items-start gap-2 text-xs ${selectionClass} ${invalidFields.includes(block.name || block.id) ? "ring-2 ring-red-500" : ""}`}>
                <input
                  type="checkbox"
                  checked={Boolean(values[block.name || block.id])}
                  onChange={(event) =>
                    setValue(block.name || block.id, event.target.checked)
                  }
                /> {block.text}{block.required ? " *" : ""}
              </label>
            ) : (
              <label key={block.id} onClick={select} className={`block cursor-pointer text-xs text-zinc-300 ${selectionClass} ${invalidFields.includes(block.name || block.id) ? "ring-2 ring-red-500" : ""}`}>
                {block.label}{block.required ? " *" : ""}
                {block.type === "Dropdown" ? (
                  <select
                    value={String(values[block.name || block.id] ?? "")}
                    onChange={(event) =>
                      setValue(block.name || block.id, event.target.value)
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-2"
                  >
                    <option value="">Selecione</option>
                    {(block.options ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                ) : block.type === "RadioButtonsGroup" || block.type === "CheckboxGroup" ? (
                  <span className="mt-2 block space-y-2">
                    {(block.options ?? []).map((option) => (
                      <label key={option.id} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2">
                        <input
                          type={block.type === "RadioButtonsGroup" ? "radio" : "checkbox"}
                          name={block.name || block.id}
                          checked={block.type === "CheckboxGroup"
                            ? (Array.isArray(values[block.name || block.id]) ? values[block.name || block.id] as string[] : []).includes(option.id)
                            : String(values[block.name || block.id] ?? "") === option.id}
                          onChange={() => {
                            const field = block.name || block.id;
                            if (block.type === "CheckboxGroup") {
                              const current = Array.isArray(values[field]) ? values[field] as string[] : [];
                              setValue(field, current.includes(option.id)
                                ? current.filter((item) => item !== option.id)
                                : [...current, option.id]);
                            } else setValue(field, option.id);
                          }}
                        />
                        {option.title}
                      </label>
                    ))}
                  </span>
                ) : block.type === "TextArea" ? (
                  <textarea
                    rows={3}
                    value={String(values[block.name || block.id] ?? "")}
                    onChange={(event) =>
                      setValue(block.name || block.id, event.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-2"
                  />
                ) : (
                  <input
                    type={block.type === "CalendarPicker" ? "date" : block.inputType === "email" ? "email" : block.inputType === "phone" ? "tel" : block.inputType === "number" ? "number" : "text"}
                    value={String(values[block.name || block.id] ?? "")}
                    onChange={(event) =>
                      setValue(block.name || block.id, event.target.value)
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-2"
                  />
                )}
              </label>
            ));
          })
          )}
        </div>
        <button
          type="button"
          disabled={!screen}
          onClick={() => {
            const required = (screen?.blocks ?? [])
              .filter((block) => block.required && isPreviewInput(block.type))
              .map((block) => block.name || block.id)
              .filter((field) => !hasPreviewValue(values[field]));
            setInvalidFields(required);
            if (required.length) return;
            if (screen?.final) setSubmitted(true);
            else if (!onAdvance(values)) setSubmitted(true);
          }}
          className="mt-4 w-full rounded-xl bg-primary-800 py-3 font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {screen?.buttonText || "Enviar"}
        </button>
        <p className="mt-4 text-center text-sm text-zinc-400">
          Gerenciada pela empresa.{" "}
          <span className="text-primary-400">Saiba mais</span>
        </p>
        <p className="mt-2 text-center text-[10px] text-zinc-500">
          preview Meta • v7.3
        </p>
      </div>
    </Card>
  );
}

type PreviewValue = string | boolean | string[];

function isPreviewInput(type: FlowBlock["type"]) {
  return ["TextInput", "TextArea", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "CalendarPicker", "OptIn"].includes(type);
}

function hasPreviewValue(value: PreviewValue | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().length > 0;
}

function previewRuleMatches(rule: BranchRule, value: PreviewValue | undefined) {
  const normalized = Array.isArray(value) ? value : String(value ?? "");
  switch (rule.op) {
    case "is_filled": return hasPreviewValue(value);
    case "is_empty": return !hasPreviewValue(value);
    case "equals": return Array.isArray(normalized) ? normalized.includes(rule.value) : normalized === rule.value;
    case "contains": return Array.isArray(normalized) ? normalized.includes(rule.value) : normalized.includes(rule.value);
    case "gt": return Number(normalized) > Number(rule.value);
    case "lt": return Number(normalized) < Number(rule.value);
    case "is_true": return value === true;
    case "is_false": return value === false;
  }
}
