import { useState } from "react";
import { FormEditorFull, FormsTab } from "./Templates";

export default function Forms() {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Formularios</h1>
          <p className="text-sm text-zinc-400">
            Crie um link publico (tipo Google Forms) para captar contatos
            automaticamente com uma tag.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
        >
          Criar formulario
        </button>
      </div>
      <FormsTab onCreate={() => setCreating(true)} />
      {creating && <FormEditorFull onClose={() => setCreating(false)} />}
    </div>
  );
}
