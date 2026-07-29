export const META_TEMPLATE_BODY_MAX_LENGTH = 1024;
export const META_TEMPLATE_FOOTER_MAX_LENGTH = 60;

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
