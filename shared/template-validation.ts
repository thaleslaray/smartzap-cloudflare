export const META_TEMPLATE_BODY_MAX_LENGTH = 1024;
export const META_TEMPLATE_FOOTER_MAX_LENGTH = 60;
export const META_TEMPLATE_BUTTON_TEXT_MAX_LENGTH = 25;
export const META_TEMPLATE_URL_MAX_LENGTH = 2000;
export const SIMPLE_TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY"] as const;

export type SimpleTemplateCategory = (typeof SIMPLE_TEMPLATE_CATEGORIES)[number];

export function isSimpleTemplateCategory(value: unknown): value is SimpleTemplateCategory {
  return SIMPLE_TEMPLATE_CATEGORIES.includes(value as SimpleTemplateCategory);
}

export function isSimpleTemplateSendContract(components: unknown): boolean {
  if (!Array.isArray(components)) return false;
  return components.every((rawComponent) => {
    if (!rawComponent || typeof rawComponent !== "object") return false;
    const component = rawComponent as Record<string, unknown>;
    const type = String(component.type ?? "").toUpperCase();
    if (["BODY", "FOOTER"].includes(type)) return true;
    if (type === "HEADER") {
      const format = String(component.format ?? "TEXT").toUpperCase();
      return format === "TEXT";
    }
    if (type !== "BUTTONS" || !Array.isArray(component.buttons)) return false;
    return component.buttons.every((rawButton) => {
      if (!rawButton || typeof rawButton !== "object") return false;
      return ["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(
        String((rawButton as Record<string, unknown>).type ?? "").toUpperCase(),
      );
    });
  });
}

export function isSimpleTemplateSendSupported(
  category: unknown,
  components: unknown,
): boolean {
  return isSimpleTemplateCategory(category) && isSimpleTemplateSendContract(components);
}

export type TemplateValidationIssue = {
  code:
    | "body_required"
    | "body_too_long"
    | "invalid_variable_syntax"
    | "variable_at_edge"
    | "variable_sequence"
    | "footer_too_long";
  field: "body" | "footer";
  message: string;
};

const POSITIONAL_VARIABLE = /\{\{(\d+)\}\}/g;

export type SimpleTemplateButton = {
  type?: unknown;
  text?: unknown;
  url?: unknown;
  phone_number?: unknown;
  example?: unknown;
};

export type TemplateButtonValidationIssue = {
  code:
    | "too_many_buttons"
    | "too_many_urls"
    | "too_many_phones"
    | "unsupported_button"
    | "button_text_required"
    | "button_text_too_long"
    | "invalid_url"
    | "invalid_url_variable"
    | "url_example_required"
    | "invalid_phone"
    | "invalid_button_grouping";
  index?: number;
  message: string;
};

export function validateSimpleTemplateButtons(
  buttons: SimpleTemplateButton[],
): TemplateButtonValidationIssue[] {
  const issues: TemplateButtonValidationIssue[] = [];
  if (buttons.length > 10) {
    issues.push({
      code: "too_many_buttons",
      message: "Use no máximo 10 botões por template.",
    });
  }

  let urls = 0;
  let phones = 0;
  const groups: Array<"quick" | "action"> = [];
  buttons.forEach((button, index) => {
    const type = String(button.type ?? "").toUpperCase();
    const text = typeof button.text === "string" ? button.text.trim() : "";
    if (!["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(type)) {
      issues.push({
        code: "unsupported_button",
        index,
        message: `O botão ${index + 1} usa um tipo não suportado pelo editor simples.`,
      });
      return;
    }
    groups.push(type === "QUICK_REPLY" ? "quick" : "action");
    if (!text) {
      issues.push({
        code: "button_text_required",
        index,
        message: `Informe o texto do botão ${index + 1}.`,
      });
    } else if (text.length > META_TEMPLATE_BUTTON_TEXT_MAX_LENGTH) {
      issues.push({
        code: "button_text_too_long",
        index,
        message: `O botão ${index + 1} pode ter no máximo ${META_TEMPLATE_BUTTON_TEXT_MAX_LENGTH} caracteres.`,
      });
    }

    if (type === "URL") {
      urls += 1;
      const url = typeof button.url === "string" ? button.url.trim() : "";
      let parsed: URL | null = null;
      try {
        parsed = new URL(url);
      } catch {
        // A mensagem única abaixo cobre URL vazia ou malformada.
      }
      if (!parsed || parsed.protocol !== "https:" || url.length > META_TEMPLATE_URL_MAX_LENGTH) {
        issues.push({
          code: "invalid_url",
          index,
          message: `Informe uma URL HTTPS válida no botão ${index + 1}, com até ${META_TEMPLATE_URL_MAX_LENGTH} caracteres.`,
        });
      }
      const variables = positionalVariables(url);
      const withoutValidVariables = url.replace(POSITIONAL_VARIABLE, "");
      if (
        /[{}]/.test(withoutValidVariables) ||
        variables.length > 1 ||
        (variables.length === 1 && (variables[0] !== 1 || !url.endsWith("{{1}}")))
      ) {
        issues.push({
          code: "invalid_url_variable",
          index,
          message: `A URL do botão ${index + 1} aceita somente {{1}} no final.`,
        });
      }
      if (variables.length === 1) {
        const example = Array.isArray(button.example)
          ? button.example.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          : [];
        if (example.length !== 1) {
          issues.push({
            code: "url_example_required",
            index,
            message: `Informe um exemplo para a parte variável da URL do botão ${index + 1}.`,
          });
        }
      }
    }

    if (type === "PHONE_NUMBER") {
      phones += 1;
      const phone = typeof button.phone_number === "string" ? button.phone_number.trim() : "";
      if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
        issues.push({
          code: "invalid_phone",
          index,
          message: `Informe um telefone internacional válido no botão ${index + 1}.`,
        });
      }
    }
  });

  if (urls > 2)
    issues.push({ code: "too_many_urls", message: "Use no máximo 2 botões de URL." });
  if (phones > 1)
    issues.push({ code: "too_many_phones", message: "Use no máximo 1 botão de telefone." });

  let transitions = 0;
  for (let index = 1; index < groups.length; index += 1)
    if (groups[index] !== groups[index - 1]) transitions += 1;
  if (transitions > 1) {
    issues.push({
      code: "invalid_button_grouping",
      message: "Agrupe respostas rápidas juntas e botões de ação juntos; não intercale os grupos.",
    });
  }
  return issues;
}

export function positionalVariables(text: string) {
  return Array.from(
    new Set(Array.from(text.matchAll(POSITIONAL_VARIABLE), (match) => Number(match[1]))),
  ).sort((a, b) => a - b);
}

export function validateMetaTemplateContent(body: string, footer = "") {
  const issues: TemplateValidationIssue[] = [];
  const trimmed = body.trim();

  if (!trimmed) {
    issues.push({
      code: "body_required",
      field: "body",
      message: "Escreva o conteúdo da mensagem.",
    });
  }
  if (body.length > META_TEMPLATE_BODY_MAX_LENGTH) {
    issues.push({
      code: "body_too_long",
      field: "body",
      message: `O corpo pode ter no máximo ${META_TEMPLATE_BODY_MAX_LENGTH} caracteres.`,
    });
  }
  if (footer.length > META_TEMPLATE_FOOTER_MAX_LENGTH) {
    issues.push({
      code: "footer_too_long",
      field: "footer",
      message: `O rodapé pode ter no máximo ${META_TEMPLATE_FOOTER_MAX_LENGTH} caracteres.`,
    });
  }

  const withoutValidVariables = body.replace(POSITIONAL_VARIABLE, "");
  if (/[{}]/.test(withoutValidVariables)) {
    issues.push({
      code: "invalid_variable_syntax",
      field: "body",
      message: "Use somente variáveis posicionais completas, como {{1}} e {{2}}.",
    });
  }

  const variables = positionalVariables(body);
  if (variables.length) {
    if (/^\{\{\d+\}\}/.test(trimmed) || /\{\{\d+\}\}$/.test(trimmed)) {
      issues.push({
        code: "variable_at_edge",
        field: "body",
        message: "A mensagem não pode começar nem terminar com uma variável. Adicione texto antes e depois dela.",
      });
    }
    const sequential = variables.every((value, index) => value === index + 1);
    if (!sequential) {
      issues.push({
        code: "variable_sequence",
        field: "body",
        message: "As variáveis devem começar em {{1}} e seguir sem lacunas: {{1}}, {{2}}, {{3}}…",
      });
    }
  }

  return issues;
}

export function templateBodyExample(body: string) {
  const variables = positionalVariables(body);
  if (!variables.length) return undefined;
  return {
    body_text: [variables.map((variable) => `Exemplo ${variable}`)],
  };
}

export function validateMetaTemplateComponents(
  components: Array<{ type?: unknown; text?: unknown }>,
) {
  const body = components.find((component) => component.type === "BODY");
  const footer = components.find((component) => component.type === "FOOTER");
  return validateMetaTemplateContent(
    typeof body?.text === "string" ? body.text : "",
    typeof footer?.text === "string" ? footer.text : "",
  );
}
