import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCreateCampaign, useEstimate, useCampaignAction } from '../hooks/useCampaigns'
import { PageHeader, Card, btnPrimary, btnSecondary, inputClass } from '../components/ui'

type Template = { name: string; language: string; category: string; status: string }

const STEP_LABELS = ['Template', 'Audiência', 'Revisão']

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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova campanha" action={<span className="text-[13px] text-zinc-500">Passo {step} de 3</span>} />

      <div className="mb-8 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const done = n < step
          const current = n === step
          return (
            <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    done
                      ? 'border-primary-400/50 bg-primary-500/20 text-primary-400'
                      : current
                        ? 'border-primary-400/50 bg-primary-500 text-primary-950'
                        : 'border-zinc-700 text-zinc-500'
                  }`}
                >
                  {done ? '✓' : n}
                </span>
                <span className={`whitespace-nowrap text-[13px] font-medium ${current ? 'text-zinc-50' : done ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {label}
                </span>
              </div>
              {n < STEP_LABELS.length && (
                <span className={`h-px min-w-6 flex-1 ${done ? 'bg-primary-400/40' : 'bg-zinc-800'}`} />
              )}
            </div>
          )
        })}
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="mb-1 text-base font-semibold">Nome e template</h2>
            <p className="text-[13px] text-zinc-400">Somente templates aprovados pela Meta podem ser usados em campanhas.</p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da campanha"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3.5">
            {approved.map((t) => {
              const selected = templateName === t.name
              return (
                <button
                  key={t.name}
                  onClick={() => setTemplateName(t.name)}
                  className={`rounded-[--radius-app] border p-4 text-left transition-colors ${
                    selected
                      ? 'border-primary-400/55 bg-primary-500/[0.07]'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                  }`}
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold">{t.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-px text-[10px] font-semibold tracking-wide ${
                          t.category === 'MARKETING'
                            ? 'border-primary-400/30 bg-primary-400/10 text-primary-400'
                            : 'border-blue-400/30 bg-blue-400/10 text-blue-400'
                        }`}
                      >
                        {t.category}
                      </span>
                      <span className="rounded-full border border-zinc-700 px-2 py-px text-[10px] font-medium text-zinc-400">
                        {t.language}
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex justify-end pt-2">
            <button
              disabled={!name || !templateName}
              onClick={async () => {
                const c = await create.mutateAsync({ name, template_name: templateName! })
                setCampaignId(c.id)
                setStep(2)
              }}
              className={btnPrimary}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 2 && campaignId && (
        <div className="space-y-5">
          <div>
            <h2 className="mb-1 text-base font-semibold">Audiência</h2>
            <p className="text-[13px] text-zinc-400">
              Todos os contatos com opt-in ativo. Contatos com opt-out ou em supressão são pulados automaticamente.
            </p>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(1)} className={btnSecondary}>Voltar</button>
            <button
              onClick={async () => {
                setEstimate(await estimateMut.mutateAsync({}))
                setStep(3)
              }}
              className={btnPrimary}
            >
              Calcular audiência e custo
            </button>
          </div>
        </div>
      )}

      {step === 3 && estimate && campaignId && (
        <div className="space-y-5">
          <div>
            <h2 className="mb-1 text-base font-semibold">Revisão e disparo</h2>
            <p className="text-[13px] text-zinc-400">Confira tudo antes de disparar — o envio não pode ser desfeito.</p>
          </div>

          <Card className="divide-y divide-[#1f1f23]">
            <div className="flex justify-between px-5 py-[13px]">
              <span className="text-[13px] text-zinc-400">Destinatários</span>
              <span className="text-[13px] font-semibold">{estimate.recipients.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between px-5 py-[13px]">
              <span className="text-[13px] text-zinc-400">Serão pulados (opt-out / supressão)</span>
              <span className="text-[13px] font-semibold text-status-skipped">{estimate.skipped.toLocaleString('pt-BR')}</span>
            </div>
          </Card>

          <div className="flex items-center gap-5 rounded-[--radius-app] border border-primary-500/25 bg-primary-500/[0.06] p-5">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-primary-400">Custo estimado da Meta</p>
              <p className="mt-1.5 text-[13px] text-zinc-400">
                {estimate.unit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 })} por mensagem entregue (tarifa oficial Meta, categoria do template)
              </p>
            </div>
            <p className="text-3xl font-bold tracking-[-0.02em] text-primary-300">
              {estimate.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(2)} className={btnSecondary}>Voltar</button>
            <button
              onClick={async () => {
                await dispatch.mutateAsync({})
                navigate(`/campaigns/${campaignId}`)
              }}
              className={btnPrimary}
            >
              Disparar agora
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
