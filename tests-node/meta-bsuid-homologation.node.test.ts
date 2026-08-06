import { describe, expect, it } from "vitest";
// O helper é JavaScript executado pelo mesmo Node dos artefatos de QA.
// @ts-expect-error não há declaração separada para o módulo interno .mjs
import * as metaBsuid from "../scripts/lib/meta-bsuid-homologation.mjs";

const {
  buildStrictBsuidTemplatePayload,
  evaluateMetaBsuidHomologation,
  isOfficialUsernameOnlyCandidate,
  maskPhone,
} = metaBsuid;

function passingInput() {
  return {
    official: {
      observed: true,
      usernamePresent: true,
      userIdPresent: true,
      phoneOmitted: true,
      storedPhoneKind: "bsuid-placeholder",
      contactRows: 1,
      conversationRows: 1,
      inboundMessageRows: 1,
      inboundEventRows: 1,
    },
    outbound: {
      recipientMode: "bsuid",
      phoneFieldOmitted: true,
      providerCallCount: 1,
      accepted: true,
      messageId: "wamid.qa",
      status: "delivered",
      operationalContractPassed: true,
      ledgerRows: 1,
      pilotRunRows: 1,
    },
    cleanup: {
      callbackRestored: true,
      officialContactRows: 0,
      officialConversationRows: 0,
      officialInboundMessageRows: 0,
      outboundStatusRows: 0,
      pilotRunActiveRows: 0,
      pilotLedgerRetainedRows: 1,
    },
  };
}

describe("homologação Meta BSUID", () => {
  it("aprova somente a composição oficial completa e limpa", () => {
    const result = evaluateMetaBsuidHomologation(passingInput());
    expect(result.status).toBe("passed");
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reprova evento que ainda possui telefone", () => {
    const input = passingInput();
    input.official.phoneOmitted = false;
    input.official.storedPhoneKind = "phone";
    const result = evaluateMetaBsuidHomologation(input);
    expect(result.status).toBe("failed");
    expect(result.checks.phoneOmitted).toBe(false);
  });

  it("reprova aceitação sem delivered/read", () => {
    const input = passingInput();
    input.outbound.status = "sent";
    const result = evaluateMetaBsuidHomologation(input);
    expect(result.checks.officialReplyAccepted).toBe(true);
    expect(result.checks.statusProgressed).toBe(false);
  });

  it("reprova envio que use telefone ou faça mais de uma chamada ao provedor", () => {
    const input = passingInput();
    input.outbound.phoneFieldOmitted = false;
    input.outbound.providerCallCount = 2;
    expect(evaluateMetaBsuidHomologation(input).checks.officialReplyAccepted).toBe(false);
    expect(evaluateMetaBsuidHomologation(input).checks.idempotencyConfirmed).toBe(false);
  });

  it("reprova replay ou persistência duplicada", () => {
    const input = passingInput();
    input.outbound.ledgerRows = 2;
    expect(evaluateMetaBsuidHomologation(input).checks.idempotencyConfirmed).toBe(false);
  });

  it("reprova Inbox sem evento idempotente persistido", () => {
    const input = passingInput();
    input.official.inboundEventRows = 0;
    expect(evaluateMetaBsuidHomologation(input).checks.conversationAssociated).toBe(false);
  });

  it("reprova qualquer resíduo ou callback não restaurado", () => {
    const input = passingInput();
    input.cleanup.outboundStatusRows = 1;
    input.cleanup.callbackRestored = false;
    expect(evaluateMetaBsuidHomologation(input).checks.cleanupPassed).toBe(false);
  });

  it("reconhece apenas contato username-only criado depois da preparação", () => {
    const preparedAt = "2026-08-06T00:00:00.000Z";
    const candidate = {
      id: "contact",
      created_at: "2026-08-06T00:00:01.000Z",
      phone: "bsuid:BR.example",
      user_id: "BR.example",
      username: "example",
    };
    expect(isOfficialUsernameOnlyCandidate(candidate, preparedAt)).toBe(true);
    expect(isOfficialUsernameOnlyCandidate({ ...candidate, phone: "+5521000000000" }, preparedAt)).toBe(false);
    expect(isOfficialUsernameOnlyCandidate({ ...candidate, username: null }, preparedAt)).toBe(false);
    expect(isOfficialUsernameOnlyCandidate({ ...candidate, created_at: "2026-08-05T23:59:59.000Z" }, preparedAt)).toBe(false);
  });

  it("mascara telefone sem preservar a parte central", () => {
    expect(maskPhone("+5521982219966")).toBe("+5521 *****-9966");
  });

  it("monta payload estrito com recipient e sem to", () => {
    const payload = buildStrictBsuidTemplatePayload({
      recipient: "BR.13491208655302741918",
      templateName: "hello_world",
      language: "en_US",
      opaqueId: "3d6f0a34-4e9f-4ec4-90e0-8471f53cf7b4",
    });
    expect(payload).toMatchObject({
      recipient: "BR.13491208655302741918",
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
    expect(payload).not.toHaveProperty("to");
  });
});
