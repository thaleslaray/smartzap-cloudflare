import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const FIELDS: { key: string; label: string; sensitive?: boolean }[] = [
  { key: 'whatsapp_token', label: 'Token de acesso Meta', sensitive: true },
  { key: 'whatsapp_phone_id', label: 'Phone Number ID' },
  { key: 'whatsapp_waba_id', label: 'WABA ID' },
  { key: 'throttle_mps', label: 'Mensagens por segundo (throttle)' },
]

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string | null>>('/api/settings') })
  const [form, setForm] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api('/api/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { setForm({}); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-sm text-zinc-400">{f.label}</label>
          <input
            type={f.sensitive ? 'password' : 'text'}
            placeholder={data?.[f.key] ?? ''}
            value={form[f.key] ?? ''}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          />
        </div>
      ))}
      {save.error && <p className="text-sm text-status-failed">{save.error.message}</p>}
      <button onClick={() => save.mutate()} disabled={!Object.keys(form).length || save.isPending}
        className="rounded-[--radius-app] bg-primary-600 px-4 py-2 text-sm font-medium disabled:opacity-40">
        Salvar
      </button>
      <p className="text-xs text-zinc-500">
        Webhook da Meta: configure a URL <code className="text-zinc-300">https://SEU-DOMINIO/webhook</code> com
        o verify token igual ao META_APP_SECRET.
      </p>
    </div>
  )
}
