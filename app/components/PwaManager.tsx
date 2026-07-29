import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onInstall);
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return () => window.removeEventListener("beforeinstallprompt", onInstall);
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true); });
      });
    }).catch((error) => console.warn("Falha ao registrar atualização offline", error));
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);
  if (!installPrompt && !updateReady) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[70] flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-primary-500/30 bg-[var(--ds-bg-elevated)] px-4 py-3 shadow-2xl">
      <p className="text-sm">{updateReady ? "Uma nova versão do SmartZap está pronta." : "Instale o SmartZap para acesso rápido e suporte offline."}</p>
      <button type="button" className="shrink-0 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-zinc-950" onClick={async () => { if (updateReady) window.location.reload(); else if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); } }}>{updateReady ? "Atualizar" : "Instalar"}</button>
    </div>
  );
}
