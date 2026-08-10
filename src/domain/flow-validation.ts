export type FlowValidationIssue = {
  path: string;
  code: string;
  message: string;
};

const SUPPORTED_VERSIONS = new Set(["7.3"]);
const SUPPORTED_DATA_API_VERSIONS = new Set(["3.0", "4.0"]);
const TEXT_COMPONENTS = new Set(["TextHeading", "TextSubheading", "TextBody", "TextCaption"]);
const INPUT_COMPONENTS = new Set([
  "TextInput", "TextArea", "Dropdown", "RadioButtonsGroup", "CheckboxGroup",
  "OptIn", "CalendarPicker",
]);
const CONTAINERS = new Set(["Form"]);
const ACTIONS = new Set(["navigate", "complete", "data_exchange"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SCREENS = 10;
const MAX_COMPONENTS_PER_SCREEN = 50;

const TEXT_LIMITS: Record<string, number> = {
  TextHeading: 80,
  TextSubheading: 80,
  TextBody: 4096,
  TextCaption: 409,
};

const FIELD_LABEL_LIMITS: Record<string, number> = {
  TextInput: 20,
  TextArea: 20,
  Dropdown: 20,
  RadioButtonsGroup: 30,
  CheckboxGroup: 30,
  CalendarPicker: 40,
  OptIn: 120,
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function allChildren(
  children: unknown,
  path: string,
  parentType = "SingleColumnLayout",
): Array<{ value: Record<string, unknown>; path: string; parentType: string }> {
  if (!Array.isArray(children)) return [];
  const result: Array<{ value: Record<string, unknown>; path: string; parentType: string }> = [];
  children.forEach((child, index) => {
    const row = object(child);
    if (!row) return;
    const childPath = `${path}[${index}]`;
    result.push({ value: row, path: childPath, parentType });
    if (Array.isArray(row.children))
      result.push(...allChildren(row.children, `${childPath}.children`, String(row.type ?? "")));
  });
  return result;
}

function bindings(value: unknown): Array<{ scope: "data" | "form"; name: string }> {
  const found: Array<{ scope: "data" | "form"; name: string }> = [];
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      for (const match of item.matchAll(/\$\{(data|form)\.([A-Za-z_][A-Za-z0-9_]*)\}/g))
        found.push({ scope: match[1] as "data" | "form", name: match[2] });
      return;
    }
    if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return found;
}

export function validateFlowJson(value: unknown): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });
  let byteLength = 0;
  try {
    byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    add("$", "NOT_SERIALIZABLE", "Flow JSON não pode ser serializado");
    return issues;
  }
  if (byteLength > MAX_BYTES)
    add("$", "MAX_BYTES_EXCEEDED", `Flow JSON excede ${MAX_BYTES} bytes`);
  const flow = object(value);
  if (!flow) {
    add("$", "INVALID_ROOT", "Flow JSON deve ser um objeto");
    return issues;
  }
  const version = String(flow.version ?? "");
  if (!SUPPORTED_VERSIONS.has(version))
    add("$.version", "UNSUPPORTED_VERSION", `Versão não suportada: ${version || "ausente"}`);
  const screens = Array.isArray(flow.screens) ? flow.screens : [];
  if (!screens.length) add("$.screens", "EMPTY_SCREENS", "Deve existir ao menos uma tela");
  if (screens.length > MAX_SCREENS)
    add("$.screens", "TOO_MANY_SCREENS", `Flow suporta no máximo ${MAX_SCREENS} telas`);
  const rows = screens.map(object);
  const ids = new Set<string>();
  const indexById = new Map<string, number>();
  let terminalCount = 0;
  let hasDataExchange = false;

  rows.forEach((screen, index) => {
    const path = `$.screens[${index}]`;
    if (!screen) {
      add(path, "INVALID_SCREEN", "Tela deve ser um objeto");
      return;
    }
    const id = String(screen.id ?? "");
    if (!/^[A-Za-z_]+$/.test(id)) add(`${path}.id`, "INVALID_SCREEN_ID", "ID aceita apenas letras e underscore");
    if (id === "SUCCESS") add(`${path}.id`, "RESERVED_SCREEN_ID", "SUCCESS é reservado para a resposta virtual de conclusão");
    if (ids.has(id)) add(`${path}.id`, "DUPLICATE_SCREEN_ID", `ID duplicado: ${id}`);
    ids.add(id);
    indexById.set(id, index);
    if (screen.terminal === true) terminalCount++;
    const title = String(screen.title ?? "");
    if (!title.trim()) add(`${path}.title`, "MISSING_SCREEN_TITLE", "Tela precisa de título");
    else if (title.length > 80) add(`${path}.title`, "SCREEN_TITLE_TOO_LONG", "Título excede 80 caracteres");
    const layout = object(screen.layout);
    if (layout?.type !== "SingleColumnLayout")
      add(`${path}.layout.type`, "INVALID_LAYOUT", "Somente SingleColumnLayout é suportado");
    const components = allChildren(layout?.children, `${path}.layout.children`);
    if (!components.length) add(`${path}.layout.children`, "EMPTY_LAYOUT", "Layout precisa de componentes");
    if (components.length > MAX_COMPONENTS_PER_SCREEN)
      add(`${path}.layout.children`, "TOO_MANY_COMPONENTS", `Tela suporta no máximo ${MAX_COMPONENTS_PER_SCREEN} componentes`);
    const formNames = new Set<string>();
    const footers = components.filter((component) => component.value.type === "Footer");
    if (footers.length !== 1)
      add(`${path}.layout.children`, "INVALID_FOOTER_COUNT", "Cada tela precisa de exatamente um Footer");
    const optInCount = components.filter((component) => component.value.type === "OptIn").length;
    if (optInCount > 5)
      add(`${path}.layout.children`, "TOO_MANY_OPT_INS", "Cada tela aceita no máximo 5 componentes OptIn");
    for (const component of components) {
      const type = String(component.value.type ?? "");
      if (!TEXT_COMPONENTS.has(type) && !INPUT_COMPONENTS.has(type) && !CONTAINERS.has(type) && type !== "Footer")
        add(`${component.path}.type`, "UNSUPPORTED_COMPONENT", `Componente não suportado: ${type || "ausente"}`);
      if (INPUT_COMPONENTS.has(type)) {
        if (component.parentType !== "Form")
          add(component.path, "INPUT_OUTSIDE_FORM", `${type} precisa estar dentro de Form`);
        const name = String(component.value.name ?? "");
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
          add(`${component.path}.name`, "INVALID_FIELD_NAME", "Campo precisa de um nome válido");
        else if (formNames.has(name)) add(`${component.path}.name`, "DUPLICATE_FIELD_NAME", `Campo duplicado: ${name}`);
        else formNames.add(name);
        if (name.length > 48)
          add(`${component.path}.name`, "FIELD_NAME_TOO_LONG", "Nome do campo excede 48 caracteres");
        const label = component.value.label;
        if (typeof label !== "string" || !label.trim())
          add(component.path, "MISSING_FIELD_LABEL", "Campo precisa de label/texto");
        else if (label.length > (FIELD_LABEL_LIMITS[type] ?? 80))
          add(component.path, "FIELD_LABEL_TOO_LONG", `Label/texto do campo excede ${FIELD_LABEL_LIMITS[type] ?? 80} caracteres`);
        const helperText = component.value["helper-text"];
        if (typeof helperText === "string" && helperText.length > 80)
          add(`${component.path}.helper-text`, "HELPER_TEXT_TOO_LONG", "Texto de ajuda excede 80 caracteres");
        const errorMessage = component.value["error-message"];
        const errorLimit = type === "TextInput" ? 30 : 80;
        if (typeof errorMessage === "string" && errorMessage.length > errorLimit)
          add(`${component.path}.error-message`, "ERROR_MESSAGE_TOO_LONG", `Mensagem de erro excede ${errorLimit} caracteres`);
        if (type === "TextArea" && typeof component.value["max-length"] === "number" && component.value["max-length"] > 600)
          add(`${component.path}.max-length`, "TEXTAREA_MAX_LENGTH_EXCEEDED", "TextArea aceita no máximo 600 caracteres");
        if (type === "CalendarPicker") {
          const calendarTitle = component.value.title;
          const description = component.value.description;
          if (typeof calendarTitle === "string" && calendarTitle.length > 80)
            add(`${component.path}.title`, "CALENDAR_TITLE_TOO_LONG", "Título do calendário excede 80 caracteres");
          if (typeof description === "string" && description.length > 300)
            add(`${component.path}.description`, "CALENDAR_DESCRIPTION_TOO_LONG", "Descrição do calendário excede 300 caracteres");
        }
        if (["Dropdown", "RadioButtonsGroup", "CheckboxGroup"].includes(type)) {
          const source = component.value["data-source"];
          if (!(Array.isArray(source) && source.length > 0) && typeof source !== "string")
            add(`${component.path}.data-source`, "MISSING_DATA_SOURCE", `${type} exige data-source`);
          if (Array.isArray(source)) {
            const hasImages = type === "Dropdown" && source.some((option) => typeof object(option)?.image === "string");
            const maxOptions = type === "Dropdown" ? (hasImages ? 100 : 200) : 20;
            if (source.length > maxOptions)
              add(`${component.path}.data-source`, "TOO_MANY_OPTIONS", `${type} aceita no máximo ${maxOptions} opções`);
            source.forEach((option, optionIndex) => {
              const row = object(option);
              if (!row || typeof row.id !== "string" || !row.id.trim())
                add(`${component.path}.data-source[${optionIndex}].id`, "INVALID_OPTION_ID", "Opção exige id");
              const optionTitle = row?.title;
              if (typeof optionTitle !== "string" || !optionTitle.trim())
                add(`${component.path}.data-source[${optionIndex}].title`, "MISSING_OPTION_TITLE", "Opção exige title");
              else if (optionTitle.length > 30)
                add(`${component.path}.data-source[${optionIndex}].title`, "OPTION_TITLE_TOO_LONG", "Título da opção excede 30 caracteres");
              if (type === "Dropdown" && typeof row?.description === "string" && row.description.length > 300)
                add(`${component.path}.data-source[${optionIndex}].description`, "OPTION_DESCRIPTION_TOO_LONG", "Descrição da opção excede 300 caracteres");
              if (type === "Dropdown" && typeof row?.metadata === "string" && row.metadata.length > 20)
                add(`${component.path}.data-source[${optionIndex}].metadata`, "OPTION_METADATA_TOO_LONG", "Metadata da opção excede 20 caracteres");
            });
          }
        }
      }
      if (TEXT_COMPONENTS.has(type)) {
        const text = component.value.text;
        if (typeof text !== "string" || !text.trim())
          add(`${component.path}.text`, "MISSING_TEXT", `${type} exige texto`);
        else if (text.length > TEXT_LIMITS[type])
          add(`${component.path}.text`, "TEXT_TOO_LONG", `Texto excede ${TEXT_LIMITS[type]} caracteres`);
      }
      if (type === "Form") {
        if (typeof component.value.name !== "string" || !String(component.value.name).trim())
          add(`${component.path}.name`, "MISSING_FORM_NAME", "Form exige name");
        if (!Array.isArray(component.value.children) || !component.value.children.length)
          add(`${component.path}.children`, "EMPTY_FORM", "Form precisa de componentes");
      }
      if (type === "Footer") {
        if (component.parentType === "Form") {
          const parentPath = component.path.replace(/\.children\[\d+\]$/, "");
          const parent = components.find((candidate) => candidate.path === parentPath)?.value;
          if (Array.isArray(parent?.children) && parent.children[parent.children.length - 1] !== component.value)
            add(component.path, "FOOTER_NOT_LAST", "Footer precisa ser o último componente do Form");
        } else if (Array.isArray(layout?.children) && layout.children[layout.children.length - 1] !== component.value) {
          add(component.path, "FOOTER_NOT_LAST", "Footer precisa ser o último componente da tela");
        }
        const label = component.value.label;
        if (typeof label !== "string" || !label.trim())
          add(`${component.path}.label`, "MISSING_FOOTER_LABEL", "Footer exige label");
        else if (label.length > 35)
          add(`${component.path}.label`, "FOOTER_LABEL_TOO_LONG", "Label do Footer excede 35 caracteres");
        const leftCaption = component.value["left-caption"];
        const centerCaption = component.value["center-caption"];
        const rightCaption = component.value["right-caption"];
        for (const [key, caption] of [["left-caption", leftCaption], ["center-caption", centerCaption], ["right-caption", rightCaption]] as const)
          if (typeof caption === "string" && caption.length > 15)
            add(`${component.path}.${key}`, "FOOTER_CAPTION_TOO_LONG", "Legenda do Footer excede 15 caracteres");
        if (typeof centerCaption === "string" && centerCaption.length > 0 &&
            ((typeof leftCaption === "string" && leftCaption.length > 0) || (typeof rightCaption === "string" && rightCaption.length > 0)))
          add(component.path, "FOOTER_CAPTION_CONFLICT", "Use legenda central ou legendas esquerda/direita, nunca ambas");
        const action = object(component.value["on-click-action"]);
        const actionName = String(action?.name ?? "");
        if (!ACTIONS.has(actionName))
          add(`${component.path}.on-click-action.name`, "INVALID_ACTION", `Ação não suportada: ${actionName || "ausente"}`);
        if (actionName === "data_exchange") hasDataExchange = true;
        if (["navigate", "complete", "data_exchange"].includes(actionName) && !object(action?.payload))
          add(`${component.path}.on-click-action.payload`, "MISSING_ACTION_PAYLOAD", `${actionName} exige payload`);
        if (actionName === "navigate") {
          const next = object(action?.next);
          const name = String(next?.name ?? "");
          if (!name) add(`${component.path}.on-click-action.next`, "MISSING_NAVIGATION_TARGET", "navigate exige next.name");
        }
        if (actionName === "complete" && screen.terminal !== true)
          add(`${component.path}.on-click-action.name`, "COMPLETE_ON_NON_TERMINAL", "complete exige tela terminal");
        if (screen.terminal === true && !["complete", "data_exchange"].includes(actionName))
          add(`${component.path}.on-click-action.name`, "TERMINAL_WITHOUT_COMPLETION", "Tela terminal exige complete ou data_exchange");
      }
    }
    if (screen.terminal === true && !components.some((item) => item.value.type === "Footer"))
      add(path, "TERMINAL_WITHOUT_FOOTER", "Tela terminal precisa de Footer");
    const data = object(screen.data) ?? {};
    for (const component of components) {
      const visible = component.value.visible;
      if (typeof visible !== "string") continue;
      const match = /^\$\{data\.([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(visible);
      if (!match) continue;
      const declaration = object(data[match[1]]);
      if (declaration?.type !== "boolean")
        add(`${component.path}.visible`, "INVALID_VISIBLE_BINDING_TYPE", "visible exige binding de data boolean");
    }
    for (const binding of bindings(screen)) {
      if (binding.scope === "data" && !(binding.name in data))
        add(path, "UNKNOWN_DATA_BINDING", `Binding data.${binding.name} não foi declarado`);
      if (binding.scope === "form" && !formNames.has(binding.name))
        add(path, "UNKNOWN_FORM_BINDING", `Binding form.${binding.name} não pertence à tela`);
    }
    if (Array.isArray(screen.sensitive)) {
      for (const field of screen.sensitive)
        if (typeof field !== "string" || !formNames.has(field))
          add(`${path}.sensitive`, "UNKNOWN_SENSITIVE_FIELD", `Campo sensível inexistente: ${String(field)}`);
    }
  });
  if (screens.length && terminalCount === 0)
    add("$.screens", "MISSING_TERMINAL", "Flow precisa de ao menos uma tela terminal");

  const routing = object(flow.routing_model);
  const edges = new Map<string, string[]>();
  if (routing) {
    for (const [from, rawTargets] of Object.entries(routing)) {
      if (!ids.has(from)) add(`$.routing_model.${from}`, "UNKNOWN_ROUTE_SOURCE", `Tela de origem inexistente: ${from}`);
      if (!Array.isArray(rawTargets)) {
        add(`$.routing_model.${from}`, "INVALID_ROUTE_LIST", "Rotas devem ser um array");
        continue;
      }
      const targets = rawTargets.map(String);
      if (targets.length > 10)
        add(`$.routing_model.${from}`, "TOO_MANY_ROUTE_TARGETS", "Uma tela aceita no máximo 10 destinos no routing_model");
      edges.set(from, targets);
      for (const target of targets) {
        if (!ids.has(target)) add(`$.routing_model.${from}`, "UNKNOWN_ROUTE_TARGET", `Tela de destino inexistente: ${target}`);
        if (target === from) add(`$.routing_model.${from}`, "SELF_ROUTE", "Rota não pode apontar para a própria tela");
        const fromIndex = indexById.get(from);
        const toIndex = indexById.get(target);
        if (fromIndex != null && toIndex != null && toIndex <= fromIndex)
          add(`$.routing_model.${from}`, "BACKWARD_ROUTE", `A rota ${from} → ${target} não é uma rota para frente`);
      }
    }
  }
  if (hasDataExchange) {
    const dataVersion = String(flow.data_api_version ?? "");
    if (!SUPPORTED_DATA_API_VERSIONS.has(dataVersion))
      add("$.data_api_version", "INVALID_DATA_API_VERSION", "data_exchange exige Data API 3.0 ou 4.0");
    if (!routing) add("$.routing_model", "MISSING_ROUTING_MODEL", "Flow com endpoint exige routing_model");
  }

  if (routing && ids.size) {
    const inbound = new Map([...ids].map((id) => [id, 0]));
    for (const targets of edges.values())
      targets.forEach((target) => inbound.set(target, (inbound.get(target) ?? 0) + 1));
    const entries = [...inbound].filter(([, count]) => count === 0).map(([id]) => id);
    if (entries.length !== 1)
      add("$.routing_model", "INVALID_ENTRY_SCREEN_COUNT", `Esperada uma entry screen; encontradas ${entries.length}`);
    if (entries.length === 1) {
      const visited = new Set<string>();
      const queue = [entries[0]];
      while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        queue.push(...(edges.get(current) ?? []));
      }
      for (const id of ids)
        if (!visited.has(id)) add(`$.routing_model.${id}`, "UNREACHABLE_SCREEN", `Tela não alcançável: ${id}`);
    }
  }

  // Valida alvos de navigate depois que todos os IDs são conhecidos.
  rows.forEach((screen, index) => {
    if (!screen) return;
    const layout = object(screen.layout);
    for (const component of allChildren(layout?.children, `$.screens[${index}].layout.children`)) {
      if (component.value.type !== "Footer") continue;
      const action = object(component.value["on-click-action"]);
      if (action?.name !== "navigate") continue;
      const target = String(object(action.next)?.name ?? "");
      if (target && !ids.has(target))
        add(`${component.path}.on-click-action.next.name`, "UNKNOWN_NAVIGATION_TARGET", `Tela inexistente: ${target}`);
    }
  });
  return issues;
}
