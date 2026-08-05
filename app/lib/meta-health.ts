export type MetaVerificationStatus =
  | "complete"
  | "credential_invalid"
  | "unavailable";

export type MetaFactStatus = "pass" | "warn" | "fail";

type MetaVerificationContext = {
  verificationStatus: MetaVerificationStatus;
  retryable: boolean;
  code: number | null;
  error: string | null;
};

export function metaVerificationUnavailableMessage(
  meta: MetaVerificationContext,
): string {
  if (meta.verificationStatus === "credential_invalid") {
    return "A Meta rejeitou a credencial. Corrija o token e execute o diagnóstico novamente.";
  }
  if (meta.retryable && meta.code === 4) {
    return "Não foi possível verificar agora: o aplicativo atingiu temporariamente o limite de consultas da Meta. Nenhuma credencial foi declarada inválida. Tente novamente após o limite normalizar.";
  }
  if (meta.retryable) {
    return "A Meta está temporariamente indisponível para verificação. Os dados abaixo permanecem desconhecidos até uma nova consulta bem-sucedida.";
  }
  return meta.error
    ? `Não foi possível concluir a verificação: ${meta.error}`
    : "Não foi possível concluir a verificação da Meta.";
}

export function metaFactPresentation(
  value: boolean | null,
  meta: MetaVerificationContext,
  passMessage: string,
  failMessage: string,
): { status: MetaFactStatus; message: string } {
  if (value === true) return { status: "pass", message: passMessage };
  if (value === false) return { status: "fail", message: failMessage };
  return {
    status: "warn",
    message: metaVerificationUnavailableMessage(meta),
  };
}

export function metaConnectionPresentation(input: {
  metaConfigured: boolean;
  metaLive: boolean;
  meta: MetaVerificationContext | null;
}): {
  title: string;
  message: string;
  tone: "success" | "warning" | "danger";
} {
  if (input.metaLive) {
    return {
      title: "Conectado",
      message: "Conexão com a Meta API validada.",
      tone: "success",
    };
  }
  if (!input.metaConfigured) {
    return {
      title: "Configuração incompleta",
      message: "Informe as credenciais obrigatórias para validar a conexão com a Meta.",
      tone: "danger",
    };
  }
  if (input.meta?.verificationStatus === "unavailable") {
    return {
      title: "Verificação indisponível",
      message: metaVerificationUnavailableMessage(input.meta),
      tone: "warning",
    };
  }
  if (input.meta?.verificationStatus === "credential_invalid") {
    return {
      title: "Credencial rejeitada",
      message: metaVerificationUnavailableMessage(input.meta),
      tone: "danger",
    };
  }
  return {
    title: "Configuração requer atenção",
    message:
      input.meta?.error ||
      "A Meta respondeu, mas um ou mais requisitos operacionais não foram atendidos.",
    tone: "danger",
  };
}
