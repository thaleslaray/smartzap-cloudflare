import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  useCreateCampaign,
  useEstimate,
  useCampaignAction,
  useSetCampaignSchedule,
  useCampaignPrecheck,
  useCampaignFolders,
  useMoveCampaignToFolder,
} from "../hooks/useCampaigns";
import { Contact, useContacts, useCustomFields } from "../hooks/useContacts";
import { useContactTags } from "../hooks/useContacts";
import { useExchangeRate } from "../hooks/useExchangeRate";
import {
  PageError,
  PageLoading,
  Card,
  Modal,
  btnPrimary,
  btnSecondary,
  inputClass,
} from "../components/ui";
import { TemplatePreviewCard } from "../components/TemplatePreviewCard";
import { formatCampaignMoney, formatCampaignUnit } from "../lib/format-money";
import {
  BRAZIL_DDD_COUNT,
  BRAZIL_STATE_OPTIONS,
  COUNTRY_DDI_OPTIONS,
  COUNTRY_PREFIXES,
  UF_PREFIXES,
} from "../lib/audience-geography";
import {
  Braces,
  Calendar,
  Clock,
  Eye,
  Folder,
  Layers,
  MessageSquare,
  RefreshCw,
  Save,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  requiresParameters: boolean;
  simpleSendSupported?: boolean;
  components?: unknown;
};
type TestContactResponse = { contact: { name: string; phone: string } | null };
type SavedSegment = {
  id: string;
  name: string;
  description: string | null;
  rules: unknown;
};

const STEP_LABELS = ["Configuração", "Público", "Validação", "Agendamento"];

const defaultCampaignName = () =>
  `Campanha ${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date())}`;

const defaultSchedule = () => {
  const value = new Date();
  const date = value.toLocaleDateString("en-CA");
  value.setMinutes(value.getMinutes() + 60);
  if (value.getMinutes() <= 30) value.setMinutes(30, 0, 0);
  else {
    value.setHours(value.getHours() + 1);
    value.setMinutes(0, 0, 0);
  }
  return `${date}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
};

const formatScheduleDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "dd/mm/aaaa";
};

const TEMPLATE_CATEGORIES = [
  { value: "", label: "Todos" },
  { value: "UTILITY", label: "Utilidade" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AUTHENTICATION", label: "Autenticação" },
] as const;

type Mapping = Record<
  string,
  {
    source: "contact_name" | "contact_phone" | "contact_email" | "custom_field" | "fixed";
    value?: string;
    fieldId?: string;
    fallback?: string;
  }
>;

const PRECHECK_REASON: Record<string, string> = {
  opt_out: "Opt-out",
  unknown_status: "Sem opt-in",
  no_consent: "Consentimento ausente",
  suppressed: "Suprimido",
  missing_template_data: "Dados obrigatórios ausentes",
  contact_not_found: "Contato não encontrado",
};

function variableKeys(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const keys: string[] = [];
  for (const raw of components) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { type?: unknown; text?: unknown; buttons?: unknown };
    const type = String(item.type ?? "").toLowerCase();
    if (type === "header" || type === "body") {
      for (const match of String(item.text ?? "").matchAll(/{{\s*(\d+)\s*}}/g))
        keys.push(`${type}.${match[1]}`);
    }
    if (type === "buttons" && Array.isArray(item.buttons))
      item.buttons.forEach((button, buttonIndex) => {
        const url =
          button && typeof button === "object"
            ? String((button as { url?: unknown }).url ?? "")
            : "";
        for (const match of url.matchAll(/{{\s*(\d+)\s*}}/g))
          keys.push(`button.${buttonIndex}.${match[1]}`);
      });
  }
  return [...new Set(keys)];
}

export default function CampaignNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(defaultCampaignName);
  const [templateSelection, setTemplateSelection] = useState<Template | null>(
    null,
  );
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [mapping, setMapping] = useState<Mapping>({});
  const [variablePickerKey, setVariablePickerKey] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [scheduleMode, setScheduleMode] = useState<"imediato" | "agendar">(
    "imediato",
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState<
    "todos" | "segmentos" | "teste"
  >("todos");
  const [combineMode, setCombineMode] = useState<"and" | "or">("or");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [saveAudienceOpen, setSaveAudienceOpen] = useState(false);
  const [savedAudienceName, setSavedAudienceName] = useState("");
  const [confirmDeleteAudience, setConfirmDeleteAudience] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [skipIgnored, setSkipIgnored] = useState(false);
  const [quickFix, setQuickFix] = useState<{
    contactId: string;
    fieldId: string;
  } | null>(null);
  const [quickFixValue, setQuickFixValue] = useState("");
  const [bulkFixFieldId, setBulkFixFieldId] = useState("");
  const [bulkFixValue, setBulkFixValue] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{
    recipients: number;
    skipped: number;
    state: "estimated" | "unavailable";
    amount: number | null;
    currency: string | null;
    effectiveFrom: string | null;
    confidence: "high" | "medium" | "low" | "unavailable";
    assumptions: string[];
    unavailableReasons: string[];
    breakdown: Array<{ market: string; recipients: number; unitPrice: number; amount: number }>;
  } | null>(null);
  const [previewContactId, setPreviewContactId] = useState("");
  const [preview, setPreview] = useState<{
    resolved: Record<string, string>;
    template: { components: unknown[] };
  } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api<{ items: Template[] }>("/api/templates"),
  });
  const exchangeRateQuery = useExchangeRate();
  const contacts = useContacts("", 1, "opt_in");
  const savedTestContact = useQuery({
    queryKey: ["settings-test-contact"],
    queryFn: () => api<TestContactResponse>("/api/settings/test-contact"),
  });
  const customFields = useCustomFields();
  const contactTags = useContactTags();
  const savedSegments = useQuery({
    queryKey: ["segments"],
    queryFn: () => api<{ items: SavedSegment[] }>("/api/segments"),
  });
  const saveAudience = useMutation({
    mutationFn: () => {
      const statePrefixes = selectedStates.flatMap((state) => UF_PREFIXES[state] ?? []);
      const countries = selectedCountries
        .filter((country) => !(country === "BR" && statePrefixes.length))
        .flatMap((country) => COUNTRY_PREFIXES[country] ?? []);
      return api<SavedSegment>("/api/segments/from-audience", {
        method: "POST",
        body: JSON.stringify({
          name: savedAudienceName,
          rules: {
            kind: "campaign_audience",
            combinator: combineMode,
            tags: selectedTags.length ? selectedTags : undefined,
            phonePrefixes: [...statePrefixes, ...countries].length ? [...statePrefixes, ...countries] : undefined,
          },
        }),
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      setSelectedSegmentId(saved.id);
      setSelectedTags([]);
      setSelectedCountries([]);
      setSelectedStates([]);
      setCountrySearch("");
      setCountryPickerOpen(false);
      setSavedAudienceName("");
      setSaveAudienceOpen(false);
    },
  });
  const deleteAudience = useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/segments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      setSelectedSegmentId("");
      setConfirmDeleteAudience(false);
    },
  });
  const previewMut = useMutation({
    mutationFn: (contactId: string) =>
      api<{
        resolved: Record<string, string>;
        template: { components: unknown[] };
      }>(`/api/campaigns/${campaignId}/preview`, {
        method: "POST",
        body: JSON.stringify({ contactId }),
      }),
    onSuccess: setPreview,
  });
  const ensureTestContact = useMutation({
    mutationFn: () =>
      api<{ contact: Contact }>("/api/settings/test-contact/ensure", {
        method: "POST",
      }),
  });
  const create = useCreateCampaign();
  const estimateMut = useEstimate(campaignId ?? "");
  const dispatch = useCampaignAction(campaignId ?? "", "dispatch");
  const setCampaignSchedule = useSetCampaignSchedule(campaignId ?? "");
  const precheck = useCampaignPrecheck(campaignId ?? "");
  const campaignFolders = useCampaignFolders();
  const moveToFolder = useMoveCampaignToFolder(campaignId ?? "");
  const saveQuickFix = useMutation({
    mutationFn: (input: {
      contactId: string;
      fieldId: string;
      value: string;
    }) =>
      api<{ ok: true }>(
        `/api/contacts/${input.contactId}/custom-values/${input.fieldId}`,
        { method: "PUT", body: JSON.stringify({ value: input.value }) },
      ),
    onSuccess: () => {
      setQuickFix(null);
      setQuickFixValue("");
      precheck.mutate(audiencePayload());
    },
  });
  const saveBulkFix = useMutation({
    mutationFn: async (input: {
      fieldId: string;
      value: string;
      contactIds: string[];
    }) => {
      await Promise.all(
        input.contactIds.map((contactId) =>
          api(`/api/contacts/${contactId}/custom-values/${input.fieldId}`, {
            method: "PUT",
            body: JSON.stringify({ value: input.value }),
          }),
        ),
      );
      return { ok: true };
    },
    onSuccess: () => {
      setBulkFixFieldId("");
      setBulkFixValue("");
      precheck.mutate(audiencePayload());
    },
  });

  const approved = (templates.data?.items ?? []).filter(
    (t) => t.status === "APPROVED" && t.simpleSendSupported === true,
  );
  const matchingTemplates = approved.filter(
    (template) =>
      (!templateCategory || template.category === templateCategory) &&
      `${template.name} ${template.language} ${template.category}`
        .toLowerCase()
        .includes(templateSearch.trim().toLowerCase()),
  );
  const hasTemplateSearch = templateSearch.trim().length > 0;
  const showTemplateResults = hasTemplateSearch || showAllTemplates;
  const recentTemplates = matchingTemplates.slice(0, 3);
  const recommendedTemplates = matchingTemplates.slice(3, 6);
  const selectedKeys = variableKeys(templateSelection?.components);
  const unsupportedSelection = Boolean(
    templateSelection?.requiresParameters && selectedKeys.length === 0,
  );
  const hasIncompleteTemplateMapping = selectedKeys.some((key) => {
    const item = mapping[key];
    if (!item) return true;
    if (item.source === "fixed") return !item.value?.trim();
    if (item.source === "custom_field") return !item.fieldId;
    return false;
  });
  const precheckMissingFieldIds = [
    ...new Set(
      precheck.data?.skippedItems.flatMap(
        (item) => item.missingFieldIds ?? [],
      ) ?? [],
    ),
  ];
  const precheckNeedsTemplateMapping = Boolean(
    precheck.data?.skippedItems.some(
      (item) =>
        item.reason === "missing_template_data" &&
        !(item.missingFieldIds?.length),
    ) && hasIncompleteTemplateMapping,
  );
  useEffect(() => {
    if (
      audienceMode !== "teste" ||
      selectedTestIds.length ||
      !savedTestContact.data?.contact ||
      ensureTestContact.isPending
    )
      return;
    ensureTestContact.mutate(undefined, {
      onSuccess: ({ contact }) => {
        setSelectedTestIds([contact.id]);
        setPreviewContactId(contact.id);
        if (campaignId && selectedKeys.length > 0) previewMut.mutate(contact.id);
      },
    });
  }, [
    audienceMode,
    savedTestContact.data?.contact,
    selectedTestIds.length,
    ensureTestContact.isPending,
    campaignId,
    selectedKeys.length,
  ]);
  useEffect(() => {
    if (
      audienceMode !== "teste" ||
      selectedTestIds.length !== 1 ||
      previewContactId === selectedTestIds[0] ||
      !campaignId ||
      selectedKeys.length === 0
    ) return;
    setPreviewContactId(selectedTestIds[0]);
    previewMut.mutate(selectedTestIds[0]);
  }, [
    audienceMode,
    campaignId,
    previewContactId,
    selectedKeys.length,
    selectedTestIds,
  ]);
  const mappingValue = (key: string) => {
    const item = mapping[key];
    if (!item) return "";
    if (item.source === "contact_name") return "{{nome}}";
    if (item.source === "contact_phone") return "{{telefone}}";
    if (item.source === "contact_email") return "{{email}}";
    if (item.source === "custom_field")
      return `{{${customFields.data?.items.find((field) => field.id === item.fieldId)?.key ?? ""}}}`;
    return item.value ?? "";
  };
  const renderVariableGroup = (prefix: string, label: string) => {
    const keys = selectedKeys.filter((key) => key.startsWith(`${prefix}.`));
    if (!keys.length) return null;
    const Icon = prefix === "header" ? Eye : MessageSquare;
    return (
      <div
        className={`space-y-3 ${prefix !== "header" ? "border-t border-[var(--ds-border-default)] pt-4" : ""}`}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
          <Icon size={14} />
          <span>{label}</span>
        </div>
        <div className="space-y-3">
          {keys.map((key) => {
            const placeholder = `{{${key.split(".").at(-1)}}}`;
            const current = mapping[key];
            return (
              <div key={key} className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3">
                <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-amber-500/20 px-2 py-1 text-xs text-amber-200">
                  {placeholder}
                </span>
            <div className="relative min-w-0 flex-1">
                    <input
                      aria-label={`Valor de ${key}`}
                      value={mappingValue(key)}
                      onChange={(event) =>
                        setMapping((items) => ({
                          ...items,
                          [key]: { source: "fixed", value: event.target.value },
                        }))
                      }
                      placeholder={`Valor para ${placeholder}`}
                      className={`w-full rounded-lg border bg-[var(--ds-bg-surface)] px-4 py-2 pr-10 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] ${mappingValue(key).trim() ? "border-[var(--ds-border-default)]" : "border-amber-400/40"}`}
                    />
                    <button
                      type="button"
                      aria-label={`Inserir variável dinâmica em ${key}`}
                      title="Inserir variável dinâmica"
                      onClick={() => setVariablePickerKey((current) => current === key ? null : key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-amber-300 transition-colors hover:bg-amber-500/10 hover:text-amber-200"
                    >
                      <Braces size={14} />
                    </button>
                    {variablePickerKey === key && (
                      <div
                        role="menu"
                        aria-label="Variáveis dinâmicas"
                        className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-56 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-2 shadow-2xl"
                      >
                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--ds-text-muted)]">Dados do contato</p>
                        {[
                          { label: "Nome", value: "contact_name", token: "{{nome}}" },
                          { label: "Telefone", value: "contact_phone", token: "{{telefone}}" },
                          { label: "E-mail", value: "contact_email", token: "{{email}}" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMapping((items) => ({
                                ...items,
                                [key]: {
                                  source: option.value as "contact_name" | "contact_phone" | "contact_email",
                                  fallback: items[key]?.fallback,
                                },
                              }));
                              setVariablePickerKey(null);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                          >
                            <span>{option.label}</span>
                            <span className="font-mono text-xs text-amber-300">{option.token}</span>
                          </button>
                        ))}
                        {customFields.data?.items.map((field) => (
                          <button
                            key={field.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMapping((items) => ({
                                ...items,
                                [key]: { source: "custom_field", fieldId: field.id, fallback: items[key]?.fallback },
                              }));
                              setVariablePickerKey(null);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                          >
                            <span className="truncate">{field.label}</span>
                            <span className="ml-2 shrink-0 font-mono text-xs text-amber-300">{`{{${field.key}}}`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                <span className="text-xs text-amber-300">obrigatório</span>
                </div>
                {current && current.source !== "fixed" && (
                  <div className="mt-3">
                    <label className="text-xs text-[var(--ds-text-muted)]" htmlFor={`fallback-${key}`}>Fallback opcional se o contato não tiver valor</label>
                    <input
                      id={`fallback-${key}`}
                      aria-label={`Fallback de ${key}`}
                      value={current.fallback ?? ""}
                      onChange={(event) => setMapping((items) => ({ ...items, [key]: { ...current, fallback: event.target.value } }))}
                      placeholder="Ex.: Cliente"
                      className="mt-1 w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const scheduleDate = scheduledAt.slice(0, 10);
  const scheduleTime = scheduledAt.slice(11, 16);
  const baseUnit =
    estimate?.state === "estimated" && estimate.breakdown.length === 1
      ? estimate.breakdown[0].unitPrice
      : null;
  const effectiveRecipients =
    skipIgnored && precheck.data
      ? precheck.data.totals.valid
      : estimate?.recipients;
  const effectiveTotal =
    estimate?.state === "estimated" &&
    (!skipIgnored || effectiveRecipients === estimate.recipients)
      ? estimate.amount
      : null;
  const usdBrlRate = exchangeRateQuery.data?.rate ?? null;
  const effectiveTotalDisplay = formatCampaignMoney(
    effectiveTotal,
    estimate?.currency,
    usdBrlRate,
  );
  const baseUnitDisplay = formatCampaignUnit(baseUnit, estimate?.currency, usdBrlRate);
  const setSchedulePart = (date: string, time: string) =>
    setScheduledAt(date || time ? `${date}T${time}` : "");
  const audiencePayload = () => {
    if (audienceMode === "teste") return { contactIds: selectedTestIds };
    if (audienceMode === "segmentos") {
      const statePrefixes = selectedStates.flatMap(
        (state) => UF_PREFIXES[state] ?? [],
      );
      const countries = selectedCountries
        .filter((country) => !(country === "BR" && statePrefixes.length))
        .flatMap((country) => COUNTRY_PREFIXES[country] ?? []);
      return {
        segmentId: selectedSegmentId || undefined,
        tags: selectedTags.length ? selectedTags : undefined,
        phonePrefixes: [...statePrefixes, ...countries],
        combinator: combineMode,
      };
    }
    return {};
  };
  const hasSegmentCriteria =
    Boolean(selectedSegmentId) ||
    selectedTags.length > 0 ||
    selectedCountries.length > 0 ||
    selectedStates.length > 0;
  const countrySearchTerm = countrySearch.trim().toLocaleLowerCase("pt-BR");
  const visibleCountries = COUNTRY_DDI_OPTIONS.filter((country) =>
    !countrySearchTerm ||
    country.name.toLocaleLowerCase("pt-BR").includes(countrySearchTerm) ||
    country.code.toLocaleLowerCase("pt-BR").includes(countrySearchTerm) ||
    country.callingCode.includes(countrySearchTerm.replace(/^\+/, "")),
  );
  const selectedCountryOptions = COUNTRY_DDI_OPTIONS.filter((country) =>
    selectedCountries.includes(country.code),
  );

  useEffect(() => {
    if (step !== 2) return;
    if (!campaignId) return;
    if (
      (audienceMode === "segmentos" && !hasSegmentCriteria) ||
      (audienceMode === "teste" && selectedTestIds.length === 0)
    ) {
      setEstimate(null);
      return;
    }
    setEstimate(null);
    estimateMut.mutate(audiencePayload(), { onSuccess: setEstimate });
    // A estimativa acompanha toda alteração de audiência. Ela é calculada no
    // servidor, com as mesmas regras que o preflight e o disparo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    campaignId,
    audienceMode,
    selectedSegmentId,
    selectedTags,
    selectedCountries,
    selectedStates,
    combineMode,
    selectedTestIds,
  ]);

  const canOpenStep = (target: number) =>
    target === 1 ||
    (target === 2 && Boolean(campaignId)) ||
    (target >= 3 && Boolean(estimate));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">App / Campanhas / Novo</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-[var(--ds-text-primary)]">
              Criar Campanha
            </h1>
          </div>
          <p className="text-sm text-[var(--ds-text-muted)]">
            Fluxo simplificado: uma decisao por vez, com contexto sempre
            visivel.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Etapas da campanha"
          >
            {STEP_LABELS.map((label, index) => {
              const n = index + 1;
              const current = n === step;
              const complete = n < step;
              const enabled = canOpenStep(n);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && setStep(n)}
                  className={`flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    current
                      ? "border-[rgba(52,211,153,0.4)] bg-[rgba(16,185,129,0.1)] text-zinc-50"
                      : "border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 aspect-square place-items-center rounded-full border text-xs font-semibold leading-none ${
                      current
                        ? "border-primary-400 bg-[rgba(16,185,129,0.2)] text-primary-200"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    {n}
                  </span>
                  <span className="min-w-0 truncate whitespace-nowrap text-xs uppercase tracking-widest">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
                <label className="block min-w-0 text-xs font-medium text-[var(--ds-text-secondary)]">
                  <span className="mb-4 block">Nome da campanha</span>
                  <input
                    aria-label="Nome da campanha"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome da campanha"
                    className="h-11 w-full rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                  />
                </label>
                <label className="block min-w-0 text-xs font-medium text-[var(--ds-text-secondary)]">
                  <span className="mb-4 block">Categoria</span>
                  <div className="relative w-full">
                    <select
                      aria-label="Filtrar por categoria"
                      style={{ color: "#f4f4f5", WebkitTextFillColor: "#f4f4f5", backgroundColor: "#18181b" }}
                      value={templateCategory}
                      onChange={(event) =>
                        setTemplateCategory(event.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] pl-4 pr-10 text-sm text-zinc-100"
                    >
                      {TEMPLATE_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-emerald-200">
                      ▾
                    </span>
                  </div>
                </label>
              </div>

              {templateSelection ? (
                <div className="flex h-11 flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/40 text-[10px] text-emerald-300">
                      ✓
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-[var(--ds-text-primary)]">
                        {templateSelection.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-[var(--ds-text-muted)]">
                        {templateSelection.category}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateSelection(null);
                      setMapping({});
                    }}
                    className="text-xs text-emerald-400/80 hover:text-emerald-300"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_10px_26px_rgba(0,0,0,0.3)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                      Template
                    </h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">
                      Busque e escolha o template da campanha.
                    </p>
                  </div>
                  <div className="mt-5">
                    <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                      Buscar template
                    </label>
                    <input
                      aria-label="Buscar template"
                      value={templateSearch}
                      onChange={(event) =>
                        setTemplateSearch(event.target.value)
                      }
                      placeholder="Digite o nome do template..."
                      className="mt-2 w-full rounded-[14px] border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                    />
                  </div>
                  <div
                    className={
                      showTemplateResults
                        ? "mt-5 max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4"
                        : "mt-5 grid grid-cols-1 gap-3 md:grid-cols-2"
                    }
                  >
                    {(showTemplateResults
                      ? [matchingTemplates]
                      : [recentTemplates, recommendedTemplates]
                    ).map((group, groupIndex) => (
                      <div
                        key={groupIndex}
                        className={
                          showTemplateResults
                            ? "text-sm [&>button+button]:mt-2"
                            : "rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-sm [&>button+button]:mt-2"
                        }
                      >
                        <div className="mb-3 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          {showTemplateResults
                            ? hasTemplateSearch
                              ? "Resultados da busca"
                              : "Todos os templates"
                            : groupIndex === 0
                              ? "Recentes"
                              : "Recomendados"}
                        </div>
                        {group.map((t) => {
                          const keys = variableKeys(t.components);
                          const unsupported =
                            t.requiresParameters && keys.length === 0;
                          return (
                            <button
                              key={`${t.name}:${t.language}`}
                              disabled={unsupported}
                              onClick={() => {
                                setTemplateSelection(t);
                                setMapping(
                                  Object.fromEntries(
                                    keys.map((key) => [
                                      key,
                                      { source: "fixed", value: "" },
                                    ]),
                                  ),
                                );
                                setVariablePickerKey(null);
                              }}
                            className="min-w-0 w-full overflow-hidden rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-left transition-colors hover:border-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                              <div
                                title={t.name}
                                className="truncate font-semibold text-[var(--ds-text-primary)]"
                              >
                                {t.name}
                              </div>
                              <div className="mt-1 text-xs text-[var(--ds-text-muted)]">
                                {t.category}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {!showTemplateResults && (
                    <button
                      type="button"
                      onClick={() => setShowAllTemplates(true)}
                      className="mt-4 text-xs text-emerald-300"
                    >
                      Ver todos os templates
                    </button>
                  )}
                  {showTemplateResults &&
                    showAllTemplates &&
                    !hasTemplateSearch && (
                      <button
                        type="button"
                        onClick={() => setShowAllTemplates(false)}
                        className="mt-4 text-xs text-[var(--ds-text-secondary)]"
                      >
                        Voltar para recentes
                      </button>
                    )}
                  {!templates.isLoading &&
                    !templates.error &&
                    matchingTemplates.length === 0 &&
                    approved.length > 0 && (
                      <p className="py-8 text-center text-sm text-zinc-500">
                        Nenhum template corresponde à busca.
                      </p>
                    )}
                </section>
              )}
              {templates.isLoading && (
                <PageLoading label="Carregando templates aprovados…" />
              )}
              {templates.error && (
                <PageError
                  message={templates.error.message}
                  onRetry={() => templates.refetch()}
                />
              )}
              {!templates.isLoading &&
                !templates.error &&
                approved.length === 0 && (
                  <Card className="px-5 py-8 text-center text-sm text-zinc-500">
                    Nenhum template aprovado está disponível. Sincronize os
                    templates antes de criar a campanha.
                  </Card>
                )}
              {templateSelection && selectedKeys.length > 0 && (
                <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                        Variáveis do Template
                      </h2>
                      <p className="text-sm text-[var(--ds-text-muted)]">
                        Preencha os valores que serão usados neste template.
                        Esses valores serão iguais para todos os destinatários.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-5">
                    {renderVariableGroup("header", "Variáveis do cabeçalho")}
                    {renderVariableGroup("body", "Variáveis do corpo")}
                    {renderVariableGroup("button", "Variáveis dos botões")}
                  </div>
                </section>
              )}
              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="text-sm text-[var(--ds-text-secondary)] transition hover:text-[var(--ds-text-primary)]"
                  >
                    Voltar
                  </button>
                  <div className="text-center text-sm text-[var(--ds-text-secondary)]">
                    {!templateSelection
                      ? "Selecione um template para continuar"
                      : !name.trim()
                        ? "Defina o nome da campanha"
                        : hasIncompleteTemplateMapping
                          ? "Preencha as variáveis obrigatórias"
                          : templateSelection.name}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={
                        !name ||
                        !templateSelection ||
                        unsupportedSelection ||
                        hasIncompleteTemplateMapping ||
                        create.isPending
                      }
                      onClick={() => {
                        create.mutate(
                          {
                            name,
                            template_name: templateSelection!.name,
                            template_language: templateSelection!.language,
                            variable_mapping: selectedKeys.length
                              ? mapping
                              : undefined,
                            scheduled_at:
                              scheduleMode === "agendar" && scheduledAt
                                ? new Date(scheduledAt).toISOString()
                                : undefined,
                          },
                          {
                            onSuccess: (campaign) => {
                              setCampaignId(campaign.id);
                              setStep(2);
                            },
                          },
                        );
                      }}
                    className={`rounded-full px-5 py-2 text-sm font-semibold transition ${name && templateSelection && !unsupportedSelection && !hasIncompleteTemplateMapping ? "bg-white text-black" : "cursor-not-allowed border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)]"}`}
                    >
                      {create.isPending ? "Criando…" : "Continuar"}
                    </button>
                  </div>
                </div>
              </div>
              {create.error && (
                <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <p className="font-medium text-red-100">Revise os dados das variáveis</p>
                  <p className="mt-1 leading-5 text-red-200/80">{create.error.message}</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && campaignId && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                    Escolha o público
                  </h2>
                  <p className="text-sm text-[var(--ds-text-muted)]">
                    Uma decisao rapida antes dos filtros.
                  </p>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(
                    [
                      {
                        value: "todos",
                        label: "Todos",
                        helper: `${contacts.data?.total ?? 0} contatos elegíveis`,
                      },
                      {
                        value: "segmentos",
                        label: "Público personalizado",
                        helper: "Público salvo, tags, DDI ou UF",
                      },
                      {
                        value: "teste",
                        label: "Teste",
                        helper: "Enviar para contato de teste",
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setAudienceMode(item.value)}
                      className={`rounded-2xl border px-4 py-4 text-left text-sm ${audienceMode === item.value ? "border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-text-primary)]" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                    >
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
                        {item.helper}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {audienceMode === "todos" && (
                <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Todos os contatos</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">
                      Nenhum filtro aplicado.
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold">
                        {estimate?.recipients ?? contacts.data?.total ?? 0}
                      </p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Elegíveis
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold text-amber-200">
                        {estimate?.skipped ?? 0}
                      </p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Suprimidos
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold">0</p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Duplicados
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-[var(--ds-text-muted)]">
                    Envio para todos os contatos válidos, excluindo opt-out e
                    suprimidos.
                  </p>
                </section>
              )}

              {audienceMode === "segmentos" && (
                <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Definir público
                      </h2>
                      <p className="text-sm text-[var(--ds-text-muted)]">
                        Use um público salvo ou combine filtros para esta campanha.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTags([]);
                        setSelectedSegmentId("");
                        setSelectedCountries([]);
                        setSelectedStates([]);
                        setCountrySearch("");
                        setCountryPickerOpen(false);
                      }}
                      className="text-xs text-[var(--ds-text-secondary)] hover:text-white"
                    >
                      Limpar
                    </button>
                  </div>
                  <div className="mt-5 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                    <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]" htmlFor="saved-segment">
                      Público salvo
                    </label>
                    <select
                      id="saved-segment"
                      aria-label="Público salvo"
                      value={selectedSegmentId}
                      onChange={(event) => {
                        setSelectedSegmentId(event.target.value);
                        setConfirmDeleteAudience(false);
                      }}
                      className="mt-2 w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)]"
                    >
                      <option value="">Nenhum — usar filtros rápidos</option>
                      {savedSegments.data?.items.map((segment) => (
                        <option key={segment.id} value={segment.id}>{segment.name}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                      Você pode combinar um público salvo com os filtros abaixo; todos os critérios precisam ser atendidos.
                    </p>
                    {savedSegments.isLoading && <p className="mt-2 text-xs text-[var(--ds-text-muted)]">Carregando segmentos salvos…</p>}
                    {savedSegments.error && <p className="mt-2 text-xs text-status-failed">Não foi possível carregar os segmentos: {savedSegments.error.message}</p>}
                    {selectedSegmentId && (
                      <div className="mt-3 border-t border-[var(--ds-border-subtle)] pt-3">
                        {!confirmDeleteAudience ? (
                          <button type="button" onClick={() => setConfirmDeleteAudience(true)} className="text-xs text-red-300 hover:text-red-200">
                            Excluir este público
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-[var(--ds-text-secondary)]">Excluir este público salvo? Isso não pode ser desfeito.</span>
                            <button type="button" disabled={deleteAudience.isPending} onClick={() => deleteAudience.mutate(selectedSegmentId)} className="font-medium text-red-300 hover:text-red-200">
                              {deleteAudience.isPending ? "Excluindo…" : "Excluir agora"}
                            </button>
                            <button type="button" disabled={deleteAudience.isPending} onClick={() => setConfirmDeleteAudience(false)} className="text-[var(--ds-text-secondary)] hover:text-white">Cancelar</button>
                          </div>
                        )}
                        {deleteAudience.error && <p role="alert" className="mt-2 text-xs text-status-failed">{deleteAudience.error.message}</p>}
                      </div>
                    )}
                  </div>
                  {!selectedSegmentId && hasSegmentCriteria && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                      <p className="text-xs text-[var(--ds-text-secondary)]">Quer reutilizar estes filtros em outra campanha?</p>
                      <button type="button" onClick={() => setSaveAudienceOpen(true)} className="shrink-0 text-xs font-medium text-emerald-200 hover:text-emerald-100">Salvar este público</button>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                    <span className="uppercase tracking-widest text-[var(--ds-text-muted)]">
                      Combinacao
                    </span>
                    {(["or", "and"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setCombineMode(mode);
                          if (mode === "and") {
                            setSelectedCountries((current) => current.slice(0, 1));
                            setSelectedStates((current) => current.slice(0, 1));
                          }
                        }}
                        className={`rounded-full border px-3 py-1 ${combineMode === mode ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                      >
                        {mode === "or" ? "Mais alcance" : "Mais preciso"}
                      </button>
                    ))}
                    <span className="text-[var(--ds-text-muted)]">
                      {combineMode === "or"
                        ? "Qualquer critério selecionado"
                        : "Todos os critérios selecionados"}
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                        Tags
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {contactTags.data?.items.length ? (
                          contactTags.data.items.map((tag) => {
                            const active = selectedTags.includes(tag.name);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() =>
                                  setSelectedTags((current) =>
                                    active
                                      ? current.filter(
                                          (name) => name !== tag.name,
                                        )
                                      : [...current, tag.name],
                                  )
                                }
                                className={`rounded-full border px-3 py-1 text-xs ${active ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                              >
                                {tag.name}
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-xs text-[var(--ds-text-muted)]">
                            Sem tags cadastradas
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                        País (DDI)
                      </p>
                      <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                        {COUNTRY_DDI_OPTIONS.length} países e territórios. Países com o mesmo DDI compartilham o mesmo filtro de número.
                      </p>
                      <button
                        type="button"
                        aria-expanded={countryPickerOpen}
                        aria-controls="country-ddi-picker"
                        onClick={() => setCountryPickerOpen((open) => !open)}
                        className="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-left text-sm text-[var(--ds-text-secondary)]"
                      >
                        <span>{selectedCountries.length ? `${selectedCountries.length} país(es) selecionado(s)` : "Selecionar países por DDI"}</span>
                        <span aria-hidden="true">⌄</span>
                      </button>
                      {countryPickerOpen && (
                        <div id="country-ddi-picker" className="mt-2 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-2 shadow-lg">
                          <input
                            value={countrySearch}
                            onChange={(event) => setCountrySearch(event.target.value)}
                            aria-label="Buscar país ou DDI"
                            placeholder="Buscar país, ISO ou +DDI"
                            className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm outline-none placeholder:text-[var(--ds-text-muted)] focus:border-emerald-400"
                          />
                          <div role="listbox" aria-label="Países por DDI" className="mt-2 max-h-56 overflow-y-auto pr-1">
                            {visibleCountries.map((country) => {
                              const active = selectedCountries.includes(country.code);
                              return (
                                <button
                                  key={country.code}
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => {
                                    setSelectedCountries((current) =>
                                      active
                                        ? current.filter((item) => item !== country.code)
                                        : combineMode === "and"
                                          ? [country.code]
                                          : [...current, country.code],
                                    );
                                    if (country.code === "BR" && active) setSelectedStates([]);
                                    if (country.code !== "BR" && !active && combineMode === "and") setSelectedStates([]);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-emerald-500/10 text-emerald-100" : "text-[var(--ds-text-secondary)] hover:bg-white/5"}`}
                                >
                                  <span>{country.name} <span className="text-[var(--ds-text-muted)]">({country.code})</span></span>
                                  <span className="font-mono text-xs">+{country.callingCode}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!!selectedCountryOptions.length && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedCountryOptions.map((country) => (
                            <span key={country.code} className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                              {country.code} +{country.callingCode}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                        UF / DDD (Brasil)
                      </p>
                      <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                        27 UFs · {BRAZIL_DDD_COUNT} DDDs. Selecione Brasil acima para habilitar.
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {BRAZIL_STATE_OPTIONS.map((state) => {
                          const active = selectedStates.includes(state);
                          return <button key={state} type="button" disabled={!selectedCountries.includes("BR")} onClick={() => setSelectedStates((current) => active ? current.filter((item) => item !== state) : combineMode === "and" ? [state] : [...current, state])} className={`min-h-9 rounded-full border px-2 py-1.5 text-xs ${active ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"} disabled:cursor-not-allowed disabled:opacity-50`}>{state}</button>;
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {audienceMode === "teste" && (
                <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Contato de teste</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">
                      O número configurado é usado automaticamente para validar a campanha.
                    </p>
                  </div>
                  {savedTestContact.data?.contact ? (
                    <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-emerald-200/80">Destino configurado</p>
                        <p className="mt-1 font-medium text-white">
                          {savedTestContact.data.contact.name || "Número de teste"}
                        </p>
                        <p className="text-sm text-[var(--ds-text-secondary)]">
                          {savedTestContact.data.contact.phone}
                        </p>
                      </div>
                      <span className="text-sm text-emerald-200">
                        {ensureTestContact.isPending ? "Preparando…" : selectedTestIds.length ? "Selecionado" : "Aguardando…"}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      Configure um número de teste em Configurações para enviar e visualizar a campanha automaticamente.
                    </div>
                  )}
                  <p className="mt-4 text-xs text-[var(--ds-text-muted)]">
                    O envio de teste não consome o público principal.
                  </p>
                </section>
              )}

              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm text-[var(--ds-text-secondary)] transition hover:text-[var(--ds-text-primary)]"
                  >
                    Voltar
                  </button>
                  <div className="text-center text-sm text-[var(--ds-text-secondary)]">
                    {estimateMut.isPending
                      ? "Calculando estimativa..."
                      : !estimate?.recipients
                        ? "Selecione um público válido"
                        : `${estimate.recipients} contatos • ${formatCampaignMoney(estimate.amount, estimate.currency, usdBrlRate).primary}`}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={
                        estimateMut.isPending ||
                        precheck.isPending ||
                        !estimate?.recipients ||
                        (audienceMode === "segmentos" && !hasSegmentCriteria) ||
                        (audienceMode === "teste" &&
                          selectedTestIds.length === 0)
                      }
                      onClick={() => {
                        estimateMut.mutate(audiencePayload(), {
                          onSuccess: (result) => {
                            setEstimate(result);
                            precheck.mutate(audiencePayload(), {
                              onSuccess: () => setStep(3),
                            });
                          },
                        });
                      }}
                      className={`rounded-full px-5 py-2 text-sm font-semibold transition ${estimate?.recipients && !(audienceMode === "segmentos" && !hasSegmentCriteria) ? "bg-white text-black" : "cursor-not-allowed border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)]"}`}
                    >
                      {estimateMut.isPending || precheck.isPending
                        ? "Validando…"
                        : audienceMode === "segmentos" && !hasSegmentCriteria
                          ? "Selecione um critério"
                        : "Continuar"}
                    </button>
                  </div>
                </div>
              </div>
              {estimateMut.error && (
                <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <p className="font-medium text-red-100">Não foi possível calcular a estimativa</p>
                  <p className="mt-1 leading-5 text-red-200/80">{estimateMut.error.message}</p>
                </div>
              )}
              {precheck.error && (
                <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <p className="font-medium text-red-100">Revise os dados das variáveis</p>
                  <p className="mt-1 leading-5 text-red-200/80">{precheck.error.message}</p>
                </div>
              )}
            </div>
          )}

          {(step === 3 || step === 4) && estimate && campaignId && (
            <div className="space-y-6">
              {step === 4 && (
                <>
                  <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                        Agendamento
                      </h2>
                      <p className="text-sm text-[var(--ds-text-muted)]">
                        Defina se o envio será agora ou programado.
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {(["imediato", "agendar"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setScheduleMode(mode)}
                          className={`rounded-xl border px-4 py-3 text-left text-sm ${scheduleMode === mode ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                        >
                          {mode === "imediato" ? "Imediato" : "Agendar"}
                        </button>
                      ))}
                    </div>
                    <div
                      className={`mt-4 transition ${scheduleMode === "agendar" ? "opacity-100" : "opacity-40"}`}
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                            Data
                          </label>
                          <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)]">
                            <span>{formatScheduleDate(scheduleDate)}</span>
                            <Calendar size={16} className="text-emerald-400" />
                            <input
                              aria-label="Data do agendamento"
                              type="date"
                              disabled={scheduleMode !== "agendar"}
                              value={scheduleDate}
                              min={new Date().toLocaleDateString("en-CA")}
                              onChange={(event) =>
                                setSchedulePart(
                                  event.target.value,
                                  scheduleTime,
                                )
                              }
                              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                            Horário
                          </label>
                          <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)]">
                            <span>{scheduleTime}</span>
                            <Clock size={16} className="text-emerald-400" />
                            <input
                              aria-label="Horário do agendamento"
                              type="time"
                              disabled={scheduleMode !== "agendar"}
                              value={scheduleTime}
                              onChange={(event) =>
                                setSchedulePart(
                                  scheduleDate,
                                  event.target.value,
                                )
                              }
                              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-[var(--ds-text-muted)]">
                        Fuso do navegador:{" "}
                        {Intl.DateTimeFormat().resolvedOptions().timeZone ||
                          "Local"}
                        .
                      </p>
                    </div>
                  </section>
                  {(campaignFolders.data?.items.length ?? 0) > 0 && (
                    <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold">Organização</h2>
                        <p className="text-sm text-[var(--ds-text-muted)]">
                          Salve em uma pasta para organizar suas campanhas
                          (opcional).
                        </p>
                      </div>
                      <div className="mt-4">
                        <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          Pasta
                        </label>
                        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId(null);
                              moveToFolder.mutate(null);
                            }}
                            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm ${selectedFolderId === null ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                          >
                            <Folder
                              size={16}
                              className="text-[var(--ds-text-muted)]"
                            />
                            Nenhuma
                          </button>
                          {campaignFolders.data?.items.map((folder) => (
                            <button
                              key={folder.id}
                              type="button"
                              onClick={() => {
                                setSelectedFolderId(folder.id);
                                moveToFolder.mutate(folder.id);
                              }}
                              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm ${selectedFolderId === folder.id ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]"}`}
                            >
                              <Folder size={16} />
                              {folder.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}
                </>
              )}

              {step === 3 && precheck.data && (
                <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                      Validação de destinatários
                    </h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">
                      Validação automática antes do disparo.
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold">
                        {precheck.data.totals.valid}
                      </p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Válidos
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold text-amber-300">
                        {precheck.data.totals.skipped}
                      </p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Ignorados
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p
                        className={`text-2xl font-semibold ${precheck.data.totals.valid === 0 ? "text-red-300" : "text-emerald-300"}`}
                      >
                        {precheck.data.totals.valid === 0
                          ? "Falhou"
                          : precheck.data.totals.skipped
                            ? "Atencao"
                            : "OK"}
                      </p>
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Status
                      </p>
                    </div>
                  </div>
                  {precheck.data.totals.skipped > 0 && (
                    <div className="mt-5 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
                            {precheckMissingFieldIds.length
                              ? "Corrigir ignorados"
                              : precheckNeedsTemplateMapping
                                ? "Mapear variáveis do template"
                                : "Contatos não elegíveis"}
                          </p>
                          <p className="text-xs text-[var(--ds-text-muted)]">
                            {precheckMissingFieldIds.length
                              ? "Alguns contatos estão sem campo personalizado obrigatório. Corrija e a validação destrava."
                              : precheckNeedsTemplateMapping
                                ? "Esta campanha foi criada sem todos os valores do template. Volte e conclua o mapeamento."
                                : "Estes contatos não podem receber esta campanha pelo status de opt-in ou supressão. Atualize o consentimento em Contatos ou prossiga somente com os válidos."}
                          </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 sm:flex-nowrap">
                          {precheckMissingFieldIds.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setBulkOpen(true)}
                              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-200"
                            >
                              <Layers size={16} />
                              <span className="whitespace-nowrap">
                                Aplicar em massa
                              </span>
                            </button>
                          ) : precheckNeedsTemplateMapping ? (
                            <button
                              type="button"
                              onClick={() => setStep(1)}
                              className="inline-flex items-center gap-2 rounded-lg border border-primary-500/40 bg-primary-600 px-3 py-2 text-sm font-semibold text-white"
                            >
                              <Wand2 size={16} />
                              <span className="whitespace-nowrap">
                                Mapear template
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigate("/contacts")}
                              className="inline-flex items-center gap-2 rounded-lg border border-primary-500/40 bg-primary-600 px-3 py-2 text-sm font-semibold text-white"
                            >
                              <Users size={16} />
                              <span className="whitespace-nowrap">
                                Abrir contatos
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={precheck.isPending}
                            onClick={() => precheck.mutate(audiencePayload())}
                            className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-white px-3 py-2 text-sm font-semibold text-black"
                          >
                            <RefreshCw size={16} />
                            <span className="whitespace-nowrap">
                              {precheck.isPending
                                ? "Validando..."
                                : "Validar novamente"}
                            </span>
                          </button>
                          {precheckMissingFieldIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const item = precheck.data?.skippedItems.find(
                                  (candidate) => candidate.missingFieldIds?.[0],
                                );
                                if (item?.missingFieldIds?.[0])
                                  setQuickFix({
                                    contactId: item.id,
                                    fieldId: item.missingFieldIds[0],
                                  });
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-primary-500/40 bg-primary-600 px-3 py-2 text-sm font-semibold text-white"
                            >
                              <Wand2 size={16} />
                              <span className="whitespace-nowrap">
                                Corrigir primeiro
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                      {bulkOpen && precheckMissingFieldIds.length > 0 && (
                        <div className="mt-4 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold">
                                Aplicar campo personalizado em massa
                              </p>
                              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                                Preenche o campo selecionado para todos os
                                contatos ignorados que estão faltando esse dado.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBulkOpen(false)}
                              className="text-sm text-[var(--ds-text-secondary)]"
                            >
                              Fechar
                            </button>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <select
                              aria-label="Campo para correção em massa"
                              value={bulkFixFieldId}
                              onChange={(event) =>
                                setBulkFixFieldId(event.target.value)
                              }
                              className={inputClass}
                            >
                              <option value="">Selecione o campo</option>
                              {precheckMissingFieldIds.map((fieldId) => (
                                <option key={fieldId} value={fieldId}>
                                  {customFields.data?.items.find(
                                    (field) => field.id === fieldId,
                                  )?.label || fieldId}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label="Valor para correção em massa"
                              value={bulkFixValue}
                              onChange={(event) =>
                                setBulkFixValue(event.target.value)
                              }
                              className={`md:col-span-2 ${inputClass}`}
                              placeholder="Ex.: teste"
                            />
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setBulkOpen(false)}
                              className={btnSecondary}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={
                                !bulkFixFieldId ||
                                !bulkFixValue.trim() ||
                                saveBulkFix.isPending
                              }
                              onClick={() =>
                                saveBulkFix.mutate({
                                  fieldId: bulkFixFieldId,
                                  value: bulkFixValue.trim(),
                                  contactIds: precheck
                                    .data!.skippedItems.filter((item) =>
                                      item.missingFieldIds?.includes(
                                        bulkFixFieldId,
                                      ),
                                    )
                                    .map((item) => item.id),
                                })
                              }
                              className={btnSecondary}
                            >
                              {saveBulkFix.isPending
                                ? "Aplicando..."
                                : "Aplicar agora"}
                            </button>
                          </div>
                        </div>
                      )}
                      {quickFix && (
                        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                          <p className="text-sm font-semibold">
                            Correção rápida
                          </p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input
                              aria-label="Valor para correção rápida"
                              value={quickFixValue}
                              onChange={(event) =>
                                setQuickFixValue(event.target.value)
                              }
                              className={inputClass}
                              placeholder="Valor do campo"
                            />
                            <button
                              type="button"
                              disabled={
                                !quickFixValue.trim() || saveQuickFix.isPending
                              }
                              onClick={() =>
                                saveQuickFix.mutate({
                                  ...quickFix,
                                  value: quickFixValue.trim(),
                                })
                              }
                              className={btnPrimary}
                            >
                              {saveQuickFix.isPending
                                ? "Salvando..."
                                : "Salvar e validar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuickFix(null)}
                              className={btnSecondary}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                      {precheck.data.totals.valid > 0 && (
                        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-3 hover:bg-[var(--ds-bg-hover)]">
                          <input
                            type="checkbox"
                            checked={skipIgnored}
                            onChange={(event) =>
                              setSkipIgnored(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-primary-500"
                          />
                          <span className="text-sm text-[var(--ds-text-secondary)]">
                            Prosseguir apenas com os{" "}
                            <strong className="text-[var(--ds-text-primary)]">
                              {precheck.data.totals.valid}
                            </strong>{" "}
                            contatos válidos
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </section>
              )}

              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <button
                    onClick={() => setStep(step === 4 ? 3 : 2)}
                    className="text-sm text-[var(--ds-text-secondary)] transition hover:text-[var(--ds-text-primary)]"
                  >
                    Voltar
                  </button>
                  <div className="text-center text-sm text-[var(--ds-text-secondary)]">
                    {step === 3 && precheck.isPending
                      ? "Validando destinatários..."
                      : step === 3 &&
                          precheck.data?.totals.skipped &&
                          !skipIgnored
                        ? "Corrija os ignorados ou marque para prosseguir apenas com válidos"
                        : step === 4 &&
                            scheduleMode === "agendar" &&
                            !scheduledAt
                          ? "Defina data e horário do agendamento"
                          : `${effectiveRecipients ?? "—"} contatos • ${effectiveTotalDisplay.primary}`}
                  </div>
                  <div className="flex items-center gap-3">
                    {step === 4 && (
                      <button
                        type="button"
                        disabled={setCampaignSchedule.isPending}
                        onClick={async () => {
                          await setCampaignSchedule.mutateAsync(
                            scheduleMode === "agendar" && scheduledAt
                              ? new Date(scheduledAt).toISOString()
                              : null,
                          );
                          navigate(`/campaigns/${campaignId}`);
                        }}
                        className="flex items-center gap-2 rounded-full border border-[var(--ds-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                      >
                        <Save size={16} />
                        Salvar Rascunho
                      </button>
                    )}
                    <button
                      disabled={
                        dispatch.isPending ||
                        setCampaignSchedule.isPending ||
                        (step === 3 &&
                          (!precheck.data?.totals.valid ||
                            (precheck.data.totals.skipped > 0 &&
                              !skipIgnored))) ||
                        (step === 4 &&
                          scheduleMode === "agendar" &&
                          !scheduledAt)
                      }
                      onClick={async () => {
                        if (step === 3) {
                          setStep(4);
                          return;
                        }
                        await setCampaignSchedule.mutateAsync(
                          scheduleMode === "agendar" && scheduledAt
                            ? new Date(scheduledAt).toISOString()
                            : null,
                        );
                        dispatch.mutate(
                          { ...audiencePayload(), skipInvalid: skipIgnored },
                          {
                            onSuccess: () =>
                              navigate(`/campaigns/${campaignId}`),
                          },
                        );
                      }}
                      className="w-full rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {step === 3
                        ? "Continuar"
                        : dispatch.isPending
                          ? "Lancando..."
                          : "Lancar campanha"}
                    </button>
                  </div>
                </div>
              </div>
              {dispatch.error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                >
                  <p className="font-medium">O disparo não foi iniciado</p>
                  <p className="mt-1 text-xs leading-5 text-red-200/80">
                    {dispatch.error.message}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          className={`flex h-full flex-col gap-4 ${step === 2 ? "xl:sticky xl:top-6" : ""}`}
        >
          <section className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                Resumo
              </p>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                Campanha Rapida
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {step >= 2 && (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-[var(--ds-text-muted)]">Contatos</dt>
                    <dd className="text-[var(--ds-text-primary)]">
                      {effectiveRecipients?.toLocaleString("pt-BR") ?? "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[var(--ds-text-muted)]">Custo estimado (BRL)</dt>
                    <dd className="text-emerald-300">
                      {effectiveTotalDisplay.primary}
                      {effectiveTotalDisplay.secondary && (
                        <span className="block text-xs font-normal text-[var(--ds-text-muted)]">
                          {effectiveTotalDisplay.secondary}
                          {exchangeRateQuery.isLoading ? " • atualizando cotação…" : ""}
                          {exchangeRateQuery.data?.source === "last_valid" ? " • última cotação válida" : ""}
                        </span>
                      )}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-[var(--ds-text-muted)]">Tarifa estimada (BRL)</dt>
                <dd className="text-right">
                  <span className="block text-emerald-300">
                    {baseUnitDisplay.primary}
                  </span>
                  {baseUnitDisplay.secondary && (
                    <span className="block text-[10px] text-[var(--ds-text-muted)]">
                      {baseUnitDisplay.secondary}
                    </span>
                  )}
                  <span className="block text-[10px] text-[var(--ds-text-muted)]">
                    {estimate?.state === "estimated"
                      ? `${templateSelection?.category || "—"} • tabela vigente ${estimate.effectiveFrom ?? "a confirmar"}`
                      : estimate?.unavailableReasons[0] ?? "Selecione público e template"}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--ds-text-muted)]">Agendamento</dt>
                <dd className="text-[var(--ds-text-primary)]">
                  {step < 4
                    ? "A definir"
                    : scheduleMode === "agendar" && scheduledAt
                      ? new Date(scheduledAt).toLocaleString("pt-BR")
                      : "Imediato"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--ds-text-muted)]">Nome</dt>
                <dd className="truncate text-right text-[var(--ds-text-primary)]">
                  {name || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--ds-text-muted)]">Template</dt>
                <dd className="truncate text-right text-[var(--ds-text-primary)]">
                  {templateSelection?.name || "—"}
                </dd>
              </div>
              {step >= 2 && (
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--ds-text-muted)]">Público</dt>
                  <dd className="text-[var(--ds-text-primary)]">
                    {effectiveRecipients != null
                      ? `${effectiveRecipients.toLocaleString("pt-BR")} contatos`
                      : "Calculando..."}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="flex-1 rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-8 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                Preview
              </p>
              <button
                type="button"
                disabled={!templateSelection}
                onClick={() => setPreviewExpanded(true)}
                className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Expandir
              </button>
            </div>
            {templateSelection ? (
              <div className="mt-6">
                <TemplatePreviewCard
                  name={templateSelection.name}
                  components={preview?.template.components ?? templateSelection.components}
                />
              </div>
            ) : (
              <div className="mt-6">
                <p className="text-base font-semibold text-[var(--ds-text-primary)]">
                  Selecione um template
                </p>
                <p className="mt-3 text-sm text-[var(--ds-text-muted)]">
                  O preview aparece aqui quando você escolher.
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
      {previewExpanded && templateSelection && (
        <Modal
          titleId="campaign-preview-title"
          onClose={() => setPreviewExpanded(false)}
          panelClassName="max-w-xl"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="campaign-preview-title" className="text-lg font-semibold">
                Preview da mensagem
              </h2>
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                {templateSelection.name} · {templateSelection.language}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewExpanded(false)}
              className={btnSecondary}
            >
              Fechar
            </button>
          </div>
          <div className="mt-5">
            <TemplatePreviewCard
              name={templateSelection.name}
              components={
                preview?.template.components ?? templateSelection.components
              }
            />
          </div>
        </Modal>
      )}
      {saveAudienceOpen && (
        <Modal titleId="save-audience-title" onClose={() => !saveAudience.isPending && setSaveAudienceOpen(false)} closeDisabled={saveAudience.isPending}>
          <div>
            <h2 id="save-audience-title" className="text-lg font-semibold">Salvar público</h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">Você poderá reutilizar estes filtros em outras campanhas.</p>
            <label className="mt-5 block text-sm font-medium" htmlFor="saved-audience-name">Nome do público</label>
            <input id="saved-audience-name" autoFocus value={savedAudienceName} onChange={(event) => setSavedAudienceName(event.target.value)} placeholder="Ex.: Clientes de São Paulo" className={`${inputClass} mt-2`} />
            {saveAudience.error && <p role="alert" className="mt-3 text-sm text-status-failed">{saveAudience.error.message}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={saveAudience.isPending} onClick={() => setSaveAudienceOpen(false)} className={btnSecondary}>Cancelar</button>
              <button type="button" disabled={!savedAudienceName.trim() || saveAudience.isPending} onClick={() => saveAudience.mutate()} className={btnPrimary}>{saveAudience.isPending ? "Salvando…" : "Salvar público"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
