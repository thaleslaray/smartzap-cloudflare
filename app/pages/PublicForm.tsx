import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { useParams } from "react-router";

import {
  Logo,
  PageError,
  PageLoading,
  btnPrimary,
  inputClass,
} from "../components/ui";
import { api } from "../lib/api";

type PublicField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
};
type PublicFormData = {
  title: string;
  slug: string;
  collectEmail?: boolean;
  successMessage?: string;
  fields: PublicField[];
};

export default function PublicForm() {
  const { slug = "" } = useParams();
  const [values, setValues] = useState<Record<string, string>>({});
  const [optInConfirmed, setOptInConfirmed] = useState(false);
  const query = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => api<PublicFormData>(`/api/public/forms/${slug}`),
  });
  const submit = useMutation({
    mutationFn: () =>
      api<{ ok: true }>(`/api/public/forms/${slug}`, {
        method: "POST",
        body: JSON.stringify({
          name: values.name || "",
          phone: values.phone || "",
          email: values.email?.trim() || undefined,
          optInConfirmed,
          values,
        }),
      }),
  });

  if (query.isLoading)
    return (
      <div className="min-h-screen bg-zinc-950">
        <PageLoading />
      </div>
    );
  if (query.error)
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-zinc-950 p-6">
        <PageError message={query.error.message} />
      </div>
    );

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-5">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <Logo size={36} />
          <span className="text-lg font-bold">SmartZap</span>
        </div>
        {submit.isSuccess ? (
          <div className="py-8 text-center">
            <h1 className="text-2xl font-semibold">Resposta enviada</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {query.data?.successMessage ||
                "Obrigado! Seus dados foram recebidos."}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{query.data?.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Preencha seus dados para ser adicionado automaticamente na lista.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
            >
              <Field
                field={{ key: "name", label: "Nome", required: true }}
                values={values}
                setValues={setValues}
              />
              <Field
                field={{
                  key: "phone",
                  label: "Telefone (WhatsApp)",
                  required: true,
                }}
                values={values}
                setValues={setValues}
              />
              {query.data?.collectEmail && (
                <Field
                  field={{ key: "email", label: "E-mail (opcional)" }}
                  values={values}
                  setValues={setValues}
                />
              )}
              {(query.data?.fields ?? [])
                .filter((field) =>
                  !["name", "phone", "email"].includes(field.key),
                )
                .map((field) => (
                  <Field
                    key={field.key}
                    field={field}
                    values={values}
                    setValues={setValues}
                  />
                ))}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-700 bg-black/20 p-4 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  required
                  checked={optInConfirmed}
                  onChange={(event) => setOptInConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                />
                <span>
                  Aceito receber mensagens deste negócio pelo WhatsApp após
                  enviar este formulário.
                </span>
              </label>
              {submit.error && (
                <p className="text-sm text-red-400">{submit.error.message}</p>
              )}
              <button
                className={`w-full ${btnPrimary}`}
                disabled={submit.isPending || !optInConfirmed}
              >
                {submit.isPending ? "Enviando…" : "Enviar"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  field,
  values,
  setValues,
}: {
  field: PublicField;
  values: Record<string, string>;
  setValues: (value: Record<string, string>) => void;
}) {
  const common = {
    required: field.required,
    value: values[field.key] || "",
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues({ ...values, [field.key]: event.target.value }),
    className: `mt-1 ${inputClass}`,
  };
  return (
    <label className="block text-xs text-zinc-400">
      {field.label}
      {field.required && " *"}
      {field.type === "select" ? (
        <select {...common}>
          <option value="">Selecione...</option>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          type={
            field.key === "email"
              ? "email"
              : field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : "text"
          }
          {...common}
        />
      )}
    </label>
  );
}
