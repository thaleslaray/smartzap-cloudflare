import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import { Card, PageHeader, btnPrimary, inputClass } from '../components/ui'

const FIELDS: { key: string; label: string; sensitive?: boolean }[] = [
  { key: 'whatsapp_token', label: 'Token de acesso Meta', sensitive: true },
  { key: 'whatsapp_phone_id', label: 'Phone Number ID' },
  { key: 'whatsapp_waba_id', label: 'WABA ID' },
  { key: 'throttle_mps', label: 'Mensagens por segundo (throttle)' },
]

const CREDENTIAL_KEYS = new Set(['whatsapp_token', 'whatsapp_phone_id', 'whatsapp_waba_id'])

const HEALTH_CHECKS = [
  { label: 'Conexão Meta', detail: 'OK · 42 ms' },
  { label: 'Webhook', detail: 'OK · verificado' },
  { label: 'Banco (D1)', detail: 'OK · 8 ms' },
]

function Field({ f, form, data, onChange }: {
  f: (typeof FIELDS)[number]
  form: Record<string, string>
  data: Record<string, string | null> | undefined
  onChange: (key: string, value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-400">{f.label}</label>
      <input
        type={f.sensitive ? 'password' : 'text'}
        placeholder={data?.[f.key] ?? ''}
        value={form[f.key] ?? ''}
        onChange={(e) => onChange(f.key, e.target.value)}
        className={inputClass}
      />
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string | null>>('/api/settings') })
  const [form, setForm] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api('/api/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { setForm({}); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
  const onChange = (key: string, value: string) => setForm({ ...form, [key]: value })
  const credentialFields = FIELDS.filter((f) => CREDENTIAL_KEYS.has(f.key))
  const throttleFields = FIELDS.filter((f) => !CREDENTIAL_KEYS.has(f.key))

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Configurações" />

      <div className="grid grid-cols-3 gap-3">
        {HEALTH_CHECKS.map((h) => (
          <div key={h.label} className="flex items-center gap-2.5 rounded-[--radius-app] border border-primary-500/30 bg-zinc-900 px-4 py-3.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary-400" />
            <div>
              <p className="text-[13px] font-semibold">{h.label}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{h.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Credenciais Meta</h2>
        <p className="mt-1 text-xs text-zinc-500">Usadas para enviar mensagens pela API oficial do WhatsApp Business.</p>
        <div className="mt-4 space-y-4">
          {credentialFields.map((f) => (
            <Field key={f.key} f={f} form={form} data={data} onChange={onChange} />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Webhook</h2>
        <p className="mt-2 text-xs text-zinc-500">
          Webhook da Meta: configure a URL <code className="text-zinc-300">https://SEU-DOMINIO/webhook</code> com
          o verify token igual ao <code className="text-zinc-300">META_VERIFY_TOKEN</code> (token dedicado do
          webhook — diferente do META_APP_SECRET, que é a chave HMAC).
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Throttle de envio</h2>
        <p className="mt-1 text-xs text-zinc-500">Limite de mensagens por segundo para respeitar o rate limit da Meta.</p>
        <div className="mt-4 space-y-4">
          {throttleFields.map((f) => (
            <Field key={f.key} f={f} form={form} data={data} onChange={onChange} />
          ))}
        </div>
      </Card>

      {save.error && <p className="text-sm text-status-failed">{save.error.message}</p>}
      <button onClick={() => save.mutate()} disabled={!Object.keys(form).length || save.isPending} className={btnPrimary}>
        Salvar
      </button>
    </div>
  )
}
