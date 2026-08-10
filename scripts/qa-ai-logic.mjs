export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsWholePhrase(text, phrase) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  const escaped = normalizedPhrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(text);
}

const HANDOFF_TERMS = [
  "pessoa",
  "atendente",
  "encaminh",
  "responsavel",
  "representante",
  "equipe humana",
  "profissional humano",
];

export function mentionsHandoff(text) {
  const normalizedText = normalize(text);
  return HANDOFF_TERMS.some((term) =>
    normalizedText.includes(normalize(term)),
  );
}
