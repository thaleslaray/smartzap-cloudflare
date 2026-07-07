import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCreateCampaign, useEstimate, useCampaignAction } from '../hooks/useCampaigns'

type Template = { name: string; language: string; category: string; status: string }

export default function CampaignNew() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<{ recipients: number; skipped: number; unit: number; total: number } | null>(null)

  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api<{ items: Template[] }>('/api/templates') })
  const create = useCreateCampaign()
  const estimateMut = useEstimate(campaignId ?? '')
  const dispatch = useCampaignAction(campaignId ?? '', 'dispatch')

  const approved = (templates.data?.items ?? []).filter((t) => t.status === 'APPROVED')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nova campanha — passo {step}/3</h1>

      {step === 1 && (
        <div className="space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da campanha"
            className="w-full rounded-[--radius-app] border border-zinc-700 bg-zinc-900 px-3 py-2" />
          <div className="grid grid-cols-2 gap-3">
            {approved.map((t) => (
              <button key={t.name} onClick={() => setTemplateName(t.name)}
                className={`rounded-[--radius-app] border p-4 text-left ${
                  templateName === t.name ? 'border-primary-500 bg-primary-950/30' : 'border-zinc-800 bg-zinc-900'}`}>
                <div className="font-medium">{t.name}</div>
                <div className="mt-1 text-xs text-zinc-400">{t.category} · {t.language}</div>
              </button>
            ))}
          </div>
          <button disabled={!name || !templateName}
            onClick={async () => {
              const c = await create.mutateAsync({ name, template_name: templateName! })
              setCampaignId(c.id); setStep(2)
            }}
            className="rounded-[--radius-app] bg-primary-600 px-4 py-2 disabled:opacity-50">Continuar</button>
        </div>
      )}

      {step === 2 && campaignId && (
        <div className="space-y-4">
          <p className="text-zinc-400">Audiência: todos os contatos com opt-in (filtro por tags disponível na API).</p>
          <button onClick={async () => { setEstimate(await estimateMut.mutateAsync({})); setStep(3) }}
            className="rounded-[--radius-app] bg-primary-600 px-4 py-2">Calcular audiência e custo</button>
        </div>
      )}

      {step === 3 && estimate && campaignId && (
        <div className="space-y-4 rounded-[--radius-app] bg-zinc-900 p-6">
          <div className="flex justify-between"><span className="text-zinc-400">Destinatários</span><b>{estimate.recipients}</b></div>
          <div className="flex justify-between"><span className="text-zinc-400">Pulados (opt-out/supressão)</span><b>{estimate.skipped}</b></div>
          <div className="flex justify-between border-t border-zinc-800 pt-4 text-lg">
            <span>Custo estimado Meta</span>
            <b className="text-primary-400">
              {estimate.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </b>
          </div>
          <p className="text-xs text-zinc-500">R$ {estimate.unit} por mensagem entregue (tarifa oficial Meta, categoria do template).</p>
          <button onClick={async () => { await dispatch.mutateAsync({}); navigate(`/campaigns/${campaignId}`) }}
            className="w-full rounded-[--radius-app] bg-primary-600 py-2 font-medium hover:bg-primary-500">
            Disparar agora
          </button>
        </div>
      )}
    </div>
  )
}
