import { DurableObject } from 'cloudflare:workers'

// Uma instância por phone_number_id — serializa a taxa de envio daquele número.
export class PhoneThrottle extends DurableObject<Env> {
  private nextSlot = 0        // timestamp (ms) do próximo slot livre
  private ratePerSecond = 10  // default conservador; Meta suporta muito mais
  private cooldownUntil = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Carrega o estado persistido antes de aceitar qualquer chamada:
    // sem isso, uma eviction no meio da campanha zeraria nextSlot e causaria burst.
    ctx.blockConcurrencyWhile(async () => {
      this.ratePerSecond = (await ctx.storage.get<number>('rate')) ?? 10
      this.nextSlot = (await ctx.storage.get<number>('nextSlot')) ?? 0
      this.cooldownUntil = (await ctx.storage.get<number>('cooldownUntil')) ?? 0
    })
  }

  async configure(rate: number): Promise<void> {
    const next = Math.max(1, rate)
    if (Date.now() < this.cooldownUntil && next > this.ratePerSecond) return
    if (next === this.ratePerSecond) return // evita write a cada batch com o mesmo valor
    this.ratePerSecond = next
    await this.ctx.storage.put('rate', next)
  }

  async backoff(rate: number, cooldownSeconds = 60): Promise<void> {
    const next = Math.max(1, Math.floor(Math.min(this.ratePerSecond, rate) * 0.5))
    this.ratePerSecond = next
    this.cooldownUntil = Date.now() + Math.max(1, cooldownSeconds) * 1000
    this.nextSlot = Math.max(this.nextSlot, this.cooldownUntil)
    await this.ctx.storage.put({ rate: next, cooldownUntil: this.cooldownUntil, nextSlot: this.nextSlot })
  }

  // `now` injetável para testes determinísticos
  async acquire(now: number = Date.now()): Promise<number> {
    const interval = 1000 / this.ratePerSecond
    const slot = Math.max(now, this.nextSlot)
    this.nextSlot = slot + interval
    // void proposital: writes são coalescidos e o output gate segura a resposta
    // até a escrita durar — durabilidade sem pagar um await por mensagem.
    void this.ctx.storage.put('nextSlot', this.nextSlot)
    return slot - now // ms que o chamador deve esperar
  }

  health(): boolean {
    return true
  }
}
