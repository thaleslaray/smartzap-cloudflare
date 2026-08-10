import { useState } from "react";
import { Check, Cloud, Copy, Download, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, Logo, focusRing, inputClass } from "../components/ui";

const REPOSITORY_URL = "https://github.com/thaleslaray/smartzap-cloudflare";
const DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(REPOSITORY_URL)}`;

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomHex(byteLength: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function installationNames() {
  const prefix = `smartzap-${randomHex(4)}`;
  return {
    project: prefix,
    database: `${prefix}-db`,
    media: `${prefix}-media`,
    webhookQueue: `${prefix}-meta-webhooks`,
    automationQueue: `${prefix}-inbox-automation`,
    conversionQueue: `${prefix}-meta-conversions`,
    conversionDlq: `${prefix}-meta-conversions-dlq`,
    webhookDlq: `${prefix}-meta-webhooks-dlq`,
    automationDlq: `${prefix}-inbox-automation-dlq`,
  };
}

const installationNameLabels: Record<keyof ReturnType<typeof installationNames>, string> = {
  project: "Projeto / Worker",
  database: "Banco D1",
  media: "Bucket R2",
  webhookQueue: "Fila de webhooks",
  automationQueue: "Fila de automações",
  conversionQueue: "Fila de conversões",
  conversionDlq: "DLQ de conversões",
  webhookDlq: "DLQ de webhooks",
  automationDlq: "DLQ de automações",
};

const passwordRules = [
  { label: "12 caracteres ou mais", test: (value: string) => value.length >= 12 },
  { label: "uma letra maiúscula", test: (value: string) => /[A-Z]/.test(value) },
  { label: "uma letra minúscula", test: (value: string) => /[a-z]/.test(value) },
  { label: "um número", test: (value: string) => /\d/.test(value) },
  { label: "um símbolo", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function randomCharacter(characters: string): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return characters[value % characters.length];
}

function generateStrongPassword(): string {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*_-+=",
  ];
  const all = groups.join("");
  const characters = groups.map(randomCharacter);
  while (characters.length < 24) characters.push(randomCharacter(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export default function Installer() {
  const [credentials, setCredentials] = useState<{
    vault: string;
    password: string;
    names: ReturnType<typeof installationNames>;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [isolationConfirmed, setIsolationConfirmed] = useState(false);

  const passwordIsStrong = password.length <= 128 && passwordRules.every((rule) => rule.test(password));
  const passwordsMatch = password.length > 0 && password === passwordConfirmation;

  const prepare = () => {
    if (!passwordIsStrong || !passwordsMatch) return;
    setCredentials({ vault: randomBase64Url(32), password, names: installationNames() });
    setCopied(null);
    setRecoverySaved(false);
    setIsolationConfirmed(false);
  };
  const suggestPassword = () => {
    const suggested = generateStrongPassword();
    setPassword(suggested);
    setPasswordConfirmation(suggested);
    setShowPassword(true);
  };
  const changePassword = () => {
    setCredentials(null);
    setCopied(null);
    setRecoverySaved(false);
    setIsolationConfirmed(false);
  };
  const copy = async (name: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(name);
  };
  const namesAsText = credentials ? [
    `Projeto / Worker=${credentials.names.project}`,
    `D1=${credentials.names.database}`,
    `R2=${credentials.names.media}`,
    `Queue WEBHOOK=${credentials.names.webhookQueue}`,
    `Queue AUTOMATION=${credentials.names.automationQueue}`,
    `Queue CAPI=${credentials.names.conversionQueue}`,
    `DLQ CAPI=${credentials.names.conversionDlq}`,
    `DLQ WEBHOOK=${credentials.names.webhookDlq}`,
    `DLQ AUTOMATION=${credentials.names.automationDlq}`,
  ].join("\n") : "";
  const download = () => {
    if (!credentials) return;
    const content = [
      "SMARTZAP — ARQUIVO DE RECUPERAÇÃO",
      "Guarde este arquivo em um cofre de senhas. Não envie por e-mail ou chat.",
      "",
      `SMARTZAP_VAULT_KEY=${credentials.vault}`,
      `MASTER_PASSWORD=${credentials.password}`,
      "",
      "NOMES EXCLUSIVOS PARA O DEPLOY CLOUDFLARE",
      namesAsText,
      "",
      `Gerado em ${new Date().toISOString()}`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smartzap-recuperacao.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setRecoverySaved(true);
  };

  return (
    <main className="min-h-screen bg-[#090d0b] px-4 py-8 text-[var(--ds-text-primary)] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center gap-3">
          <Logo size={42} />
          <div>
            <p className="text-sm font-semibold">SmartZap</p>
            <p className="text-xs text-[var(--ds-text-muted)]">Instalação segura na sua Cloudflare</p>
          </div>
        </header>

        <section className="mb-8 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#96f6bc]">Passo 1 de 2</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Proteja sua instalação antes do deploy.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--ds-text-secondary)] sm:text-base">
            Você escolhe a senha do painel. A chave técnica do cofre é gerada somente neste navegador. O SmartZap não envia, registra nem guarda uma cópia.
          </p>
        </section>

        {!credentials ? (
          <Card className="p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[#96f6bc]/20 bg-[#96f6bc]/10 p-3 text-[#96f6bc]"><KeyRound /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Crie sua senha administrativa</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--ds-text-secondary)]">
                  Essa é a senha que você usará para entrar no SmartZap. A chave AES-256 do cofre será criada automaticamente no próximo passo.
                </p>
                <div className="mt-5 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Senha administrativa</span>
                    <span className="relative block">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        maxLength={128}
                        autoComplete="new-password"
                        aria-describedby="password-requirements"
                        aria-invalid={password.length > 0 && !passwordIsStrong}
                        onChange={(event) => setPassword(event.target.value)}
                        className={`${inputClass} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className={`absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-400 hover:text-white ${focusRing}`}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Confirme a senha</span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordConfirmation}
                      maxLength={128}
                      autoComplete="new-password"
                      aria-invalid={passwordConfirmation.length > 0 && !passwordsMatch}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      className={inputClass}
                    />
                    {passwordConfirmation.length > 0 && !passwordsMatch && (
                      <span className="mt-2 block text-sm text-status-failed" role="alert">As senhas não coincidem.</span>
                    )}
                  </label>
                </div>
                <div id="password-requirements" className="mt-4" aria-live="polite">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">Sua senha precisa ter</p>
                  <ul className="mt-2 grid gap-2 text-sm text-[var(--ds-text-secondary)] sm:grid-cols-2">
                    {passwordRules.map((rule) => {
                      const passed = rule.test(password);
                      return <li key={rule.label} className={passed ? "text-[#96f6bc]" : undefined}><Check className="mr-2 inline" size={15} aria-hidden="true" />{rule.label}</li>;
                    })}
                  </ul>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Button type="button" onClick={prepare} disabled={!passwordIsStrong || !passwordsMatch}><ShieldCheck size={17} /> Criar chave do cofre</Button>
                  <Button type="button" variant="secondary" onClick={suggestPassword}><RefreshCw size={17} /> Gerar senha forte</Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {([
              ["vault", "SMARTZAP_VAULT_KEY", credentials.vault],
              ["password", "MASTER_PASSWORD", credentials.password],
            ] as const).map(([name, label, value]) => (
              <Card key={name} className="p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">{label}</p>
                    <code className="mt-2 block overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[#d9ffe7]">{value}</code>
                  </div>
                  <button type="button" onClick={() => copy(name, value)} className={`min-h-11 rounded-xl border border-white/10 px-4 text-sm ${focusRing}`}>
                    {copied === name ? <Check className="mr-2 inline" size={16} /> : <Copy className="mr-2 inline" size={16} />}
                    {copied === name ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </Card>
            ))}

            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">Nomes exclusivos da instalação</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ds-text-secondary)]">
                    Na Cloudflare, substitua o nome do projeto e de cada recurso pelos valores abaixo. Não aceite um recurso existente ou pré-selecionado.
                  </p>
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    {(Object.entries(credentials.names) as Array<[keyof typeof credentials.names, string]>).map(([name, value]) => (
                      <div key={name} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
                        <dt className="text-xs uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">{installationNameLabels[name]}</dt>
                        <dd><code className="mt-1 block overflow-x-auto text-[#d9ffe7]">{value}</code></dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button type="button" onClick={() => copy("names", namesAsText)} className={`min-h-11 rounded-xl border border-white/10 px-4 text-sm ${focusRing}`}>
                  {copied === "names" ? <Check className="mr-2 inline" size={16} /> : <Copy className="mr-2 inline" size={16} />}
                  {copied === "names" ? "Nomes copiados" : "Copiar nomes"}
                </button>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100/90">
                <input type="checkbox" checked={isolationConfirmed} onChange={(event) => setIsolationConfirmed(event.target.checked)} className="mt-1 size-4" />
                <span>Vou usar estes nomes e conferir que D1, R2 e filas aparecem como <strong>novos</strong> antes de publicar.</span>
              </label>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button type="button" variant="secondary" onClick={download}><Download size={17} /> Baixar recuperação</Button>
              <Button type="button" variant="secondary" onClick={changePassword}><RefreshCw size={17} /> Alterar senha</Button>
              {recoverySaved && isolationConfirmed ? (
                <a href={DEPLOY_URL} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-[#f1fff6] px-4 text-sm font-semibold text-[#0b1711] ${focusRing}`}>
                  <Cloud size={17} /> Deploy to Cloudflare
                </a>
              ) : (
                <button type="button" disabled className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-600">
                  <Cloud size={17} /> {recoverySaved ? "Confirme os nomes" : "Salve a recuperação"}
                </button>
              )}
            </div>

            <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100/80">
              Baixe o arquivo antes de continuar. Na Cloudflare, cole os dois segredos e use somente os nomes exclusivos acima. O deploy também bloqueia um D1 já utilizado por outra instalação. Depois, abra <strong>/setup</strong>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
