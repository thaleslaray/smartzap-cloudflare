export function nextPositionalTemplateVariable(text: string) {
  const used = new Set(
    Array.from(text.matchAll(/\{\{(\d+)\}\}/g), (match) => Number(match[1])),
  );
  let next = 1;
  while (used.has(next)) next += 1;
  return `{{${next}}}`;
}

export function insertTemplateVariable(
  text: string,
  start: number,
  end: number,
) {
  const variable = nextPositionalTemplateVariable(text);
  return {
    value: `${text.slice(0, start)}${variable}${text.slice(end)}`,
    cursor: start + variable.length,
    variable,
  };
}

export function positionalTemplateVariables(text: string) {
  return Array.from(
    new Set(Array.from(text.matchAll(/\{\{(\d+)\}\}/g), (match) => Number(match[1]))),
  ).sort((a, b) => a - b);
}
