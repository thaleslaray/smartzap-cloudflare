import { getCountries, getCountryCallingCode } from "libphonenumber-js";

export type CountryDdiOption = {
  code: string;
  name: string;
  callingCode: string;
  prefix: string;
};

const regionNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });

/**
 * Catálogo mantido pela libphonenumber-js (metadados ITU). Mantemos o código
 * ISO na seleção porque alguns países/territórios compartilham o mesmo DDI.
 */
export const COUNTRY_DDI_OPTIONS: CountryDdiOption[] = getCountries()
  .map((code) => {
    const callingCode = getCountryCallingCode(code);
    return {
      code,
      name: regionNames.of(code) ?? code,
      callingCode,
      prefix: `+${callingCode}`,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

export const COUNTRY_PREFIXES = Object.fromEntries(
  COUNTRY_DDI_OPTIONS.map((country) => [country.code, [country.prefix]]),
) as Record<string, string[]>;

/** DDDs válidos por UF. O 61 é compartilhado por DF e GO e por isso aparece nos dois grupos. */
const BRAZIL_DDDS_BY_STATE: Record<string, string[]> = {
  AC: ["68"],
  AL: ["82"],
  AP: ["96"],
  AM: ["92", "97"],
  BA: ["71", "73", "74", "75", "77"],
  CE: ["85", "88"],
  DF: ["61"],
  ES: ["27", "28"],
  GO: ["61", "62", "64"],
  MA: ["98", "99"],
  MT: ["65", "66"],
  MS: ["67"],
  MG: ["31", "32", "33", "34", "35", "37", "38"],
  PA: ["91", "93", "94"],
  PB: ["83"],
  PR: ["41", "42", "43", "44", "45", "46"],
  PE: ["81", "87"],
  PI: ["86", "89"],
  RJ: ["21", "22", "24"],
  RN: ["84"],
  RS: ["51", "53", "54", "55"],
  RO: ["69"],
  RR: ["95"],
  SC: ["47", "48", "49"],
  SP: ["11", "12", "13", "14", "15", "16", "17", "18", "19"],
  SE: ["79"],
  TO: ["63"],
};

export const UF_PREFIXES = Object.fromEntries(
  Object.entries(BRAZIL_DDDS_BY_STATE).map(([state, ddds]) => [
    state,
    ddds.map((ddd) => `+55${ddd}`),
  ]),
) as Record<string, string[]>;

export const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};
export const BRAZIL_STATE_OPTIONS = Object.keys(UF_PREFIXES);
export const BRAZIL_DDD_COUNT = new Set(
  Object.values(UF_PREFIXES).flat(),
).size;
