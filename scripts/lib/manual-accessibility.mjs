import { createHash } from "node:crypto";

export const MANUAL_ACCESSIBILITY_ATTESTATION =
  "Executei pessoalmente todos os casos com tecnologia assistiva real, sem omitir falhas, e registrei fielmente o que foi anunciado e observado.";

export const MANUAL_ACCESSIBILITY_CHECKS = Object.freeze([
  "keyboardOnly",
  "focusOrder",
  "visibleFocus",
  "zoom200",
  "screenReader",
  "modalsAndMenus",
  "criticalFlows",
  "zeroBlockingIssue",
]);

export const MANUAL_ACCESSIBILITY_CASES = Object.freeze([
  {
    id: "login-session",
    title: "Login, erro e recuperação de sessão",
    routes: ["/login", "/campaigns sem sessão"],
    instructions: [
      "Entrar somente por teclado e confirmar que o erro de credencial é anunciado.",
      "Abrir uma rota protegida sem sessão e confirmar o retorno previsível ao login.",
    ],
    expected: "Campos possuem nome e instrução; erro é anunciado uma vez; foco não se perde.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "criticalFlows"],
  },
  {
    id: "navigation-dashboard",
    title: "Navegação principal e Dashboard",
    routes: ["/", "menu móvel"],
    instructions: [
      "Percorrer cabeçalho, navegação e conteúdo somente por teclado.",
      "Em largura móvel e zoom 200%, abrir o menu, circular com Tab e Shift+Tab e fechar com Escape.",
    ],
    expected: "Landmarks e título são anunciados; foco fica contido no menu e retorna ao acionador.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "zoom200", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "campaigns",
    title: "Campanhas, filtros e criação",
    routes: ["/campaigns", "/campaigns/new", "/campaigns/:id"],
    instructions: [
      "Buscar, filtrar e abrir uma campanha usando teclado e leitor de tela.",
      "Percorrer as etapas de criação, provocar uma validação e fechar qualquer diálogo com Escape.",
    ],
    expected: "Etapa, validação, status e diálogo são anunciados; nenhum controle fica inacessível.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "contacts-segments",
    title: "Contatos, importação e segmentação",
    routes: ["/contacts", "/segments", "/campaigns/new#publico"],
    instructions: [
      "Buscar, filtrar e selecionar contatos somente por teclado.",
      "Abrir e cancelar a importação e conferir tags, DDI, UF/DDD e segmentos salvos.",
    ],
    expected: "Contagens, seleção, filtros e erros possuem nome/estado; modal devolve o foco.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "inbox-ai",
    title: "Inbox, conversa, template e IA",
    routes: ["/inbox", "/inbox/:id"],
    instructions: [
      "Alternar entre lista e conversa, ler histórico e acessar ações da IA.",
      "Abrir o envio de template, resolver variáveis e cancelar antes do envio real.",
    ],
    expected: "Mensagens, remetente, status e ações são anunciados em ordem; confirmação não dispara sozinha.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "templates-builders",
    title: "Templates, Forms, MiniApps e Projetos/Fábrica",
    routes: ["/templates", "/templates/new", "/templates/drafts/new", "/forms", "/flows", "/template-projects"],
    instructions: [
      "Percorrer abas, listas, editor e prévias sem mouse.",
      "Abrir um item existente de Forms, MiniApps e Projetos e voltar sem perder o contexto.",
    ],
    expected: "Abas, etapas, campos, prévias, estados e botões têm nome, função e valor compreensíveis.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "criticalFlows"],
  },
  {
    id: "knowledge-agents",
    title: "Conhecimento, IA e agentes",
    routes: ["/knowledge", "/settings/ai", "/settings/ai/agents"],
    instructions: [
      "Percorrer documentos, upload, configuração global e agentes.",
      "Abrir um diálogo, conferir estados ocupados/indisponíveis e cancelar sem salvar.",
    ],
    expected: "Upload, progresso, disponibilidade, ajuda e erros são anunciados; foco retorna corretamente.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "settings-diagnostics",
    title: "Configurações, diagnósticos e performance",
    routes: ["/settings", "/settings/meta-diagnostics", "/settings/performance", "/settings/attendants"],
    instructions: [
      "Percorrer campos sensíveis sem revelar seu valor no leitor de tela.",
      "Ler diagnósticos, estados indisponíveis e métricas; abrir e cancelar ações destrutivas.",
    ],
    expected: "Segredos permanecem mascarados; estado desconhecido não é anunciado como inválido; alertas são claros.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "modalsAndMenus", "criticalFlows"],
  },
  {
    id: "public-surfaces",
    title: "Formulário público e portal do atendente",
    routes: ["/f/:slug", "/atendimento?token=...", "/atendimento sem token"],
    instructions: [
      "Preencher um formulário público de teste, provocar validação e não concluir a submissão.",
      "Abrir o portal com fixture válida e sem token; navegar por conversa e erros.",
    ],
    expected: "Validações, confirmação, conversa e link inválido são anunciados; não há armadilha de teclado.",
    requiredChecks: ["keyboardOnly", "focusOrder", "visibleFocus", "screenReader", "criticalFlows"],
  },
  {
    id: "zoom-reflow-errors",
    title: "Zoom 200%, reflow, 404 e acesso proibido",
    routes: ["todas as superfícies anteriores", "/rota-inexistente", "acesso sem permissão"],
    instructions: [
      "Repetir os pontos críticos em zoom real de 200%, incluindo largura móvel.",
      "Confirmar 404 e acesso proibido, sem corte bidimensional ou ação invisível.",
    ],
    expected: "Conteúdo reflui, foco permanece visível e erros informam problema e próximo passo.",
    requiredChecks: ["keyboardOnly", "visibleFocus", "zoom200", "screenReader", "criticalFlows", "zeroBlockingIssue"],
  },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function hashManualAccessibility(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function caseIdentity(item) {
  return {
    id: item.id,
    title: item.title,
    routes: item.routes,
    instructions: item.instructions,
    expected: item.expected,
    requiredChecks: item.requiredChecks,
  };
}

export function buildManualAccessibilityReview({ release, createdAt = new Date().toISOString() }) {
  if (!release?.sourceCommit || !release?.productionVersion || !release?.productionUrl)
    throw new Error("Release produtiva incompleta.");
  const requirements = {
    standard: "WCAG 2.1 AA",
    allCasesRequired: true,
    supportedScreenReaders: ["VoiceOver", "NVDA"],
    requiredChecks: MANUAL_ACCESSIBILITY_CHECKS,
    attestation: MANUAL_ACCESSIBILITY_ATTESTATION,
  };
  const sourcePlanHash = hashManualAccessibility({ release, requirements, cases: MANUAL_ACCESSIBILITY_CASES });
  return {
    schemaVersion: 1,
    kind: "smartzap-manual-accessibility-review",
    release,
    sourcePlanHash,
    createdAt,
    reviewer: { name: "", reviewedAt: "", attestation: "" },
    environment: {
      screenReader: "",
      screenReaderVersion: "",
      browser: "",
      browserVersion: "",
      operatingSystem: "",
      device: "",
      zoomPercent: null,
    },
    requirements,
    items: MANUAL_ACCESSIBILITY_CASES.map((testCase) => {
      const identity = caseIdentity(testCase);
      return {
        ...identity,
        caseFingerprint: hashManualAccessibility(identity),
        verdict: null,
        observations: "",
        notes: "",
      };
    }),
  };
}

export function evaluateManualAccessibilityReview({ review, release }) {
  const issues = [];
  const expected = buildManualAccessibilityReview({
    release,
    createdAt: review?.createdAt || new Date(0).toISOString(),
  });
  if (review?.schemaVersion !== 1 || review?.kind !== expected.kind)
    issues.push("arquivo de revisão com contrato inválido");
  if (hashManualAccessibility(review?.release) !== hashManualAccessibility(release))
    issues.push("revisão pertence a outra release");
  if (review?.sourcePlanHash !== expected.sourcePlanHash)
    issues.push("plano de acessibilidade diverge");
  if (hashManualAccessibility(review?.requirements) !== hashManualAccessibility(expected.requirements))
    issues.push("requisitos da revisão foram alterados");
  if (!Number.isFinite(Date.parse(review?.createdAt || "")))
    issues.push("data de preparação ausente ou inválida");

  const reviewerName = String(review?.reviewer?.name || "").trim();
  if (reviewerName.length < 2) issues.push("nome do revisor humano ausente");
  const reviewedAt = Date.parse(review?.reviewer?.reviewedAt || "");
  if (!Number.isFinite(reviewedAt)) issues.push("data da revisão humana ausente ou inválida");
  if (review?.reviewer?.attestation !== MANUAL_ACCESSIBILITY_ATTESTATION)
    issues.push("declaração de execução pessoal ausente");

  const environment = review?.environment || {};
  if (!expected.requirements.supportedScreenReaders.some((name) =>
    String(environment.screenReader || "").toLowerCase().includes(name.toLowerCase())))
    issues.push("leitor de tela real deve ser VoiceOver ou NVDA");
  for (const field of ["screenReaderVersion", "browser", "browserVersion", "operatingSystem", "device"])
    if (String(environment[field] || "").trim().length < 1)
      issues.push(`ambiente sem ${field}`);
  if (Number(environment.zoomPercent) !== 200) issues.push("zoom real deve ser 200%");

  if (!Array.isArray(review?.items) || review.items.length !== expected.items.length)
    issues.push(`a revisão precisa conter ${expected.items.length} casos`);
  const expectedItems = new Map(expected.items.map((item) => [item.id, item]));
  const seen = new Set();
  const covered = new Set();
  let passedCases = 0;
  let failedCases = 0;
  for (const item of review?.items || []) {
    if (seen.has(item.id)) {
      issues.push(`caso duplicado: ${item.id}`);
      continue;
    }
    seen.add(item.id);
    const source = expectedItems.get(item.id);
    if (!source) {
      issues.push(`caso inesperado: ${item.id}`);
      continue;
    }
    if (item.caseFingerprint !== source.caseFingerprint ||
      hashManualAccessibility(caseIdentity(item)) !== source.caseFingerprint)
      issues.push(`conteúdo do caso foi alterado: ${item.id}`);
    if (!['pass', 'fail'].includes(item.verdict)) {
      issues.push(`veredito ausente: ${item.id}`);
      continue;
    }
    if (String(item.observations || "").trim().length < 10)
      issues.push(`observação concreta ausente: ${item.id}`);
    if (item.verdict === "fail") {
      failedCases += 1;
      if (String(item.notes || "").trim().length < 5)
        issues.push(`reprovação sem descrição: ${item.id}`);
    } else {
      passedCases += 1;
      for (const check of source.requiredChecks) covered.add(check);
    }
  }
  for (const id of expectedItems.keys()) if (!seen.has(id)) issues.push(`caso ausente: ${id}`);
  for (const check of MANUAL_ACCESSIBILITY_CHECKS)
    if (!covered.has(check)) issues.push(`checagem sem caso aprovado: ${check}`);

  const checks = Object.fromEntries(MANUAL_ACCESSIBILITY_CHECKS.map((check) => [
    check,
    covered.has(check) && failedCases === 0,
  ]));
  const passed = issues.length === 0 && passedCases === expected.items.length && failedCases === 0
    && Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1,
    kind: "smartzap-manual-accessibility-result",
    status: passed ? "passed" : "failed",
    release,
    reviewer: reviewerName || null,
    performedAt: Number.isFinite(reviewedAt) ? new Date(reviewedAt).toISOString() : null,
    environment,
    metrics: { totalCases: expected.items.length, passedCases, failedCases, coveredChecks: covered.size },
    checks,
    issues,
  };
}
