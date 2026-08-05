export type LocalFlowDefinitionIssue = {
  path: string;
  code: string;
  message: string;
};

export const LOCAL_FLOW_BLOCK_TYPES = [
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "TextInput",
  "TextArea",
  "CalendarPicker",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "OptIn",
] as const;

export const LOCAL_FLOW_BRANCH_OPERATORS = [
  "is_filled",
  "is_empty",
  "equals",
  "contains",
  "gt",
  "lt",
  "is_true",
  "is_false",
] as const;

export const LOCAL_FLOW_LIMITS = {
  screens: 10,
  blocksPerScreen: 48,
  optInsPerScreen: 5,
  fieldName: 48,
  optionTitle: 30,
  buttonText: 35,
  screenTitle: 80,
  options: {
    Dropdown: 200,
    RadioButtonsGroup: 20,
    CheckboxGroup: 20,
  },
  text: {
    TextHeading: 80,
    TextSubheading: 80,
    TextBody: 4096,
    TextCaption: 409,
    OptIn: 120,
  },
  label: {
    TextInput: 20,
    TextArea: 20,
    CalendarPicker: 40,
    Dropdown: 20,
    RadioButtonsGroup: 30,
    CheckboxGroup: 30,
  },
} as const;

const blockTypes = new Set<string>(LOCAL_FLOW_BLOCK_TYPES);
const branchOperators = new Set<string>(LOCAL_FLOW_BRANCH_OPERATORS);
const textTypes = new Set(["TextHeading", "TextSubheading", "TextBody", "TextCaption"]);
const inputTypes = new Set([
  "TextInput",
  "TextArea",
  "CalendarPicker",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "OptIn",
]);
const choiceTypes = new Set(["Dropdown", "RadioButtonsGroup", "CheckboxGroup"]);
const explicitlyUnsupported = new Set(["DatePicker", "PhotoPicker", "DocumentPicker"]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findLocalActions(
  value: unknown,
  path: string,
  add: (path: string, code: string, message: string) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findLocalActions(item, `${path}[${index}]`, add));
    return;
  }
  const row = object(value);
  if (!row) return;
  for (const [key, child] of Object.entries(row)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "on-click-action" || key === "onClickAction") {
      const action = object(child);
      const name = String(action?.name ?? "ação customizada");
      add(
        childPath,
        ["open_url", "update_data"].includes(name)
          ? "UNSUPPORTED_LOCAL_ACTION"
          : "CUSTOM_ACTION_NOT_ALLOWED",
        `A ação ${name} não é configurável neste editor; use telas e ramificações declaradas`,
      );
    } else {
      findLocalActions(child, childPath, add);
    }
  }
}

export function validateLocalFlowDefinition(
  definition: unknown,
  mapping: unknown = {},
  options: { requireScreens?: boolean } = {},
): LocalFlowDefinitionIssue[] {
  const issues: LocalFlowDefinitionIssue[] = [];
  const add = (path: string, code: string, message: string) =>
    issues.push({ path, code, message });
  const source = object(definition);
  if (!source) {
    add("$", "INVALID_DEFINITION", "A definição do MiniApp precisa ser um objeto");
    return issues;
  }

  findLocalActions(source, "$", add);
  const hasScreens = Object.prototype.hasOwnProperty.call(source, "screens");
  if (!hasScreens && !options.requireScreens) return issues;
  const screens = Array.isArray(source.screens) ? source.screens : [];
  if (!screens.length) {
    add("$.screens", "EMPTY_SCREENS", "O MiniApp precisa ter ao menos uma tela");
    return issues;
  }
  if (screens.length > LOCAL_FLOW_LIMITS.screens)
    add(
      "$.screens",
      "TOO_MANY_SCREENS",
      `O editor aceita no máximo ${LOCAL_FLOW_LIMITS.screens} telas`,
    );

  const screenIds = new Map<string, number>();
  const fieldNamesByScreen = new Map<string, Set<string>>();
  const allFieldNames = new Set<string>();
  if (source.dynamicBooking === true)
    [
      "selected_service",
      "selected_date",
      "selected_slot",
      "customer_name",
      "customer_phone",
      "notes",
    ].forEach((name) => allFieldNames.add(name));
  screens.forEach((rawScreen, screenIndex) => {
    const path = `$.screens[${screenIndex}]`;
    const screen = object(rawScreen);
    if (!screen) {
      add(path, "INVALID_SCREEN", "A tela precisa ser um objeto");
      return;
    }
    const id = nonEmpty(screen.id) ? screen.id : "";
    if (!id) add(`${path}.id`, "MISSING_SCREEN_ID", "A tela precisa de ID");
    else if (screenIds.has(id)) add(`${path}.id`, "DUPLICATE_SCREEN_ID", `ID de tela duplicado: ${id}`);
    else screenIds.set(id, screenIndex);
    if (!nonEmpty(screen.title)) add(`${path}.title`, "MISSING_SCREEN_TITLE", "A tela precisa de título");
    else if (screen.title.length > LOCAL_FLOW_LIMITS.screenTitle)
      add(`${path}.title`, "SCREEN_TITLE_TOO_LONG", `O título aceita até ${LOCAL_FLOW_LIMITS.screenTitle} caracteres`);
    if (screen.buttonText !== undefined) {
      if (!nonEmpty(screen.buttonText)) add(`${path}.buttonText`, "MISSING_BUTTON_TEXT", "O botão precisa de texto");
      else if (screen.buttonText.length > LOCAL_FLOW_LIMITS.buttonText)
        add(`${path}.buttonText`, "BUTTON_TEXT_TOO_LONG", `O botão aceita até ${LOCAL_FLOW_LIMITS.buttonText} caracteres`);
    }

    const blocks = screen.blocks === undefined ? [] : Array.isArray(screen.blocks) ? screen.blocks : [];
    if (screen.blocks !== undefined && !Array.isArray(screen.blocks))
      add(`${path}.blocks`, "INVALID_BLOCKS", "Os blocos precisam formar uma lista");
    if (blocks.length > LOCAL_FLOW_LIMITS.blocksPerScreen)
      add(
        `${path}.blocks`,
        "TOO_MANY_BLOCKS",
        `O editor aceita no máximo ${LOCAL_FLOW_LIMITS.blocksPerScreen} blocos por tela`,
      );
    const names = new Set<string>();
    fieldNamesByScreen.set(id, names);
    let optIns = 0;
    blocks.forEach((rawBlock, blockIndex) => {
      const blockPath = `${path}.blocks[${blockIndex}]`;
      const block = object(rawBlock);
      if (!block) {
        add(blockPath, "INVALID_BLOCK", "O bloco precisa ser um objeto");
        return;
      }
      const type = String(block.type ?? "");
      if (!blockTypes.has(type)) {
        add(
          `${blockPath}.type`,
          explicitlyUnsupported.has(type) ? "UNSUPPORTED_EDITOR_COMPONENT" : "UNKNOWN_EDITOR_COMPONENT",
          explicitlyUnsupported.has(type)
            ? `${type} não é suportado pelo editor atual e não será salvo nem publicado`
            : `Componente desconhecido: ${type || "ausente"}`,
        );
        return;
      }
      if (textTypes.has(type)) {
        if (!nonEmpty(block.text)) add(`${blockPath}.text`, "MISSING_TEXT", `${type} exige texto`);
        else {
          const max = LOCAL_FLOW_LIMITS.text[type as keyof typeof LOCAL_FLOW_LIMITS.text];
          if (block.text.length > max)
            add(`${blockPath}.text`, "TEXT_TOO_LONG", `${type} aceita até ${max} caracteres`);
        }
      }
      if (inputTypes.has(type)) {
        const name = nonEmpty(block.name) ? block.name : "";
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
          add(`${blockPath}.name`, "INVALID_FIELD_NAME", "O campo precisa de um nome válido");
        else if (name.length > LOCAL_FLOW_LIMITS.fieldName)
          add(`${blockPath}.name`, "FIELD_NAME_TOO_LONG", `O nome aceita até ${LOCAL_FLOW_LIMITS.fieldName} caracteres`);
        else if (names.has(name)) add(`${blockPath}.name`, "DUPLICATE_FIELD_NAME", `Campo duplicado: ${name}`);
        else {
          names.add(name);
          allFieldNames.add(name);
        }
        const labelValue = type === "OptIn" ? block.label ?? block.text : block.label;
        if (!nonEmpty(labelValue)) add(blockPath, "MISSING_FIELD_LABEL", `${type} exige label ou texto`);
        else {
          const max = type === "OptIn"
            ? LOCAL_FLOW_LIMITS.text.OptIn
            : LOCAL_FLOW_LIMITS.label[type as keyof typeof LOCAL_FLOW_LIMITS.label];
          if (labelValue.length > max)
            add(blockPath, "FIELD_LABEL_TOO_LONG", `${type} aceita até ${max} caracteres no label`);
        }
        if (type === "TextInput" && !["text", "email", "phone", "number"].includes(String(block.inputType ?? "text")))
          add(`${blockPath}.inputType`, "INVALID_INPUT_TYPE", "TextInput aceita text, email, phone ou number");
        if (type === "OptIn") optIns += 1;
      }
      if (choiceTypes.has(type)) {
        const choices = Array.isArray(block.options) ? block.options : [];
        if (!choices.length) add(`${blockPath}.options`, "MISSING_OPTIONS", `${type} exige ao menos uma opção`);
        const max = LOCAL_FLOW_LIMITS.options[type as keyof typeof LOCAL_FLOW_LIMITS.options];
        if (choices.length > max)
          add(`${blockPath}.options`, "TOO_MANY_OPTIONS", `${type} aceita no máximo ${max} opções`);
        const optionIds = new Set<string>();
        choices.forEach((rawOption, optionIndex) => {
          const optionPath = `${blockPath}.options[${optionIndex}]`;
          const option = object(rawOption);
          if (!option || !nonEmpty(option.id)) add(`${optionPath}.id`, "INVALID_OPTION_ID", "A opção exige ID");
          else if (optionIds.has(option.id)) add(`${optionPath}.id`, "DUPLICATE_OPTION_ID", `Opção duplicada: ${option.id}`);
          else optionIds.add(option.id);
          if (!option || !nonEmpty(option.title)) add(`${optionPath}.title`, "MISSING_OPTION_TITLE", "A opção exige título");
          else if (option.title.length > LOCAL_FLOW_LIMITS.optionTitle)
            add(`${optionPath}.title`, "OPTION_TITLE_TOO_LONG", `O título da opção aceita até ${LOCAL_FLOW_LIMITS.optionTitle} caracteres`);
        });
      }
    });
    if (optIns > LOCAL_FLOW_LIMITS.optInsPerScreen)
      add(
        `${path}.blocks`,
        "TOO_MANY_OPT_INS",
        `Cada tela aceita no máximo ${LOCAL_FLOW_LIMITS.optInsPerScreen} componentes OptIn`,
      );
  });

  screens.forEach((rawScreen, screenIndex) => {
    const screen = object(rawScreen);
    if (!screen) return;
    const path = `$.screens[${screenIndex}]`;
    if (typeof screen.next === "string") {
      const target = screenIds.get(screen.next);
      if (target === undefined) add(`${path}.next`, "UNKNOWN_SCREEN_TARGET", `Tela inexistente: ${screen.next}`);
      else if (target <= screenIndex) add(`${path}.next`, "BACKWARD_SCREEN_TARGET", "A navegação precisa avançar para uma tela posterior");
    }
  });

  const rawBranches = object(source.branchesByScreen) ?? {};
  for (const [screenId, rawRules] of Object.entries(rawBranches)) {
    const sourceIndex = screenIds.get(screenId);
    if (sourceIndex === undefined) {
      add(`$.branchesByScreen.${screenId}`, "UNKNOWN_BRANCH_SOURCE", `Tela de origem inexistente: ${screenId}`);
      continue;
    }
    if (!Array.isArray(rawRules)) {
      add(`$.branchesByScreen.${screenId}`, "INVALID_BRANCH_LIST", "As regras precisam formar uma lista");
      continue;
    }
    const fields = fieldNamesByScreen.get(screenId) ?? new Set<string>();
    rawRules.forEach((rawRule, ruleIndex) => {
      const rulePath = `$.branchesByScreen.${screenId}[${ruleIndex}]`;
      const rule = object(rawRule);
      if (!rule) {
        add(rulePath, "INVALID_BRANCH", "A regra precisa ser um objeto");
        return;
      }
      if (!nonEmpty(rule.field) || !fields.has(rule.field))
        add(`${rulePath}.field`, "UNKNOWN_BRANCH_FIELD", `Campo da regra inexistente: ${String(rule.field ?? "")}`);
      if (!branchOperators.has(String(rule.op ?? "")))
        add(`${rulePath}.op`, "UNSUPPORTED_BRANCH_OPERATOR", `Operador não suportado: ${String(rule.op ?? "")}`);
      if (!nonEmpty(rule.next)) add(`${rulePath}.next`, "MISSING_BRANCH_TARGET", "A regra precisa de destino");
      else {
        const targetIndex = screenIds.get(rule.next);
        if (targetIndex === undefined) add(`${rulePath}.next`, "UNKNOWN_BRANCH_TARGET", `Tela inexistente: ${rule.next}`);
        else if (targetIndex <= sourceIndex)
          add(`${rulePath}.next`, "BACKWARD_BRANCH_TARGET", "A ramificação precisa avançar para uma tela posterior");
      }
    });
  }

  const mappingRow = object(mapping) ?? {};
  const contact = object(mappingRow.contact) ?? {};
  for (const key of ["nameField", "emailField"] as const) {
    const value = contact[key];
    if (value !== undefined && (!nonEmpty(value) || !allFieldNames.has(value)))
      add(`$.mapping.contact.${key}`, "UNKNOWN_MAPPING_FIELD", `Campo de mapeamento inexistente: ${String(value ?? "")}`);
  }
  const customFields = object(mappingRow.customFields) ?? {};
  for (const [fieldId, value] of Object.entries(customFields)) {
    if (!nonEmpty(value) || !allFieldNames.has(value))
      add(`$.mapping.customFields.${fieldId}`, "UNKNOWN_MAPPING_FIELD", `Campo de mapeamento inexistente: ${String(value ?? "")}`);
  }
  const confirmation = object(source.confirmation);
  if (confirmation) {
    if (typeof confirmation.title === "string" && confirmation.title.length > 80)
      add("$.confirmation.title", "CONFIRMATION_TITLE_TOO_LONG", "O título da confirmação aceita até 80 caracteres");
    if (typeof confirmation.footer === "string" && confirmation.footer.length > 60)
      add("$.confirmation.footer", "CONFIRMATION_FOOTER_TOO_LONG", "O rodapé da confirmação aceita até 60 caracteres");
    if (Array.isArray(confirmation.fields))
      confirmation.fields.forEach((field, index) => {
        if (typeof field !== "string" || !allFieldNames.has(field))
          add(`$.confirmation.fields[${index}]`, "UNKNOWN_CONFIRMATION_FIELD", `Campo de confirmação inexistente: ${String(field)}`);
      });
  }
  return issues;
}

export function assertLocalFlowDefinition(
  definition: unknown,
  mapping: unknown = {},
  options: { requireScreens?: boolean } = {},
) {
  const issues = validateLocalFlowDefinition(definition, mapping, options);
  if (!issues.length) return;
  const first = issues[0];
  throw new Error(`${first.path} [${first.code}]: ${first.message}`);
}
