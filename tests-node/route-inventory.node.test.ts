import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authenticatedOperationalRoutes,
  coveredDynamicRoutePatterns,
  publicStaticRoutes,
} from "../e2e/support/route-inventory";

const source = readFileSync(resolve(import.meta.dirname, "../app/App.tsx"), "utf8");
const mountedPaths = [...source.matchAll(/path="([^"]+)"/g)].map((match) =>
  match[1].startsWith("/") ? match[1] : `/${match[1]}`,
);

describe("inventário de rotas do gate", () => {
  it("inclui toda rota autenticada estática montada no aplicativo", () => {
    const mountedStatic = mountedPaths.filter(
      (path) =>
        !path.includes(":") &&
        !path.includes("*") &&
        !["/login", "/atendimento", ...publicStaticRoutes].includes(path),
    );
    expect([...authenticatedOperationalRoutes].sort()).toEqual(
      [...new Set(["/", ...mountedStatic])].sort(),
    );
  });

  it("declara separadamente as rotas públicas estáticas", () => {
    const mountedPublic = mountedPaths.filter((path) =>
      publicStaticRoutes.includes(path as (typeof publicStaticRoutes)[number]),
    );
    expect([...publicStaticRoutes].sort()).toEqual([...new Set(mountedPublic)].sort());
  });

  it("declara cobertura para todo padrão dinâmico montado", () => {
    const mountedDynamic = mountedPaths.filter((path) => path.includes(":"));
    expect([...coveredDynamicRoutePatterns].sort()).toEqual(
      [...new Set(mountedDynamic)].sort(),
    );
  });

  it("não volta a publicar o mockup visual descontinuado", () => {
    expect(mountedPaths).not.toContain("/design-preview");
  });
});
