# Design System (baseado em campaigns/new)

Este guia resume o padrao visual e estrutural da rota `app/(dashboard)/campaigns/new/page.tsx`.
Use como kit base para novas telas do dashboard.

## Escopo
- Base visual: dark zinc + acentos emerald/amber
- Layout: wizard em 2 colunas, cards empilhados
- Estados: ativo (emerald), alerta (amber), desabilitado (gray)

## Tokens visuais (classes usadas)

### Superficies
- `bg-zinc-900/60` (card principal)
- `bg-zinc-950/40` (inputs, listas, subcards)
- `bg-black` (modal / dialog)
- `bg-emerald-500/10` (realce ativo)
- `bg-amber-500/10` (alerta)
- `bg-white` (acao primaria final)

### Bordas
- `border-white/10` (default)
- `border-emerald-400/40` (ativo)
- `border-amber-400/30` (alerta)

### Texto
- `text-white` (primario)
- `text-gray-500` / `text-gray-400` / `text-gray-600` (secundario)
- `text-emerald-200` / `text-emerald-300` (status positivo)
- `text-amber-200` / `text-amber-300` (aviso)

### Raio e sombra
- `rounded-2xl` (cards)
- `rounded-xl` (inputs, subcards)
- `rounded-full` (chips e botoes pill)
- `shadow-[0_12px_30px_rgba(0,0,0,0.35)]` (cards)
- `shadow-[0_10px_26px_rgba(0,0,0,0.3)]` (card de template)

## Tipografia
- Titulo principal: `text-3xl font-semibold`
- Secao: `text-lg font-semibold`
- Label: `text-xs uppercase tracking-widest text-gray-500`
- Corpo: `text-sm`
- Hint/micro: `text-xs text-gray-500`

## Layout e grid
- Pagina: `space-y-6`
- Colunas: `grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`
- Cards: `rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]`
- Inputs: `h-11 rounded-xl border border-white/10 bg-zinc-950/40 px-4 text-sm text-white placeholder:text-gray-600`

## Componentes base (padrao)

### Card base
- Estrutura: container com `rounded-2xl`, borda baixa, fundo zinc
- Uso: secoes principais (config, publico, validacao, agendamento)

### Stepper
- Grid: `grid grid-cols-2 md:grid-cols-4`
- Botao ativo: `border-emerald-400/40 bg-emerald-500/10 text-white`
- Botao inativo: `border-white/10 bg-zinc-900/40 text-gray-400`
- Step badge: circulo com borda e numero

### Botao primario final
- Normal: `bg-white text-black` com `rounded-full px-5 py-2`
- Desabilitado: `border border-white/10 bg-white/10 text-gray-500`

### Chips / filtros
- Ativo: `border-emerald-400/40 bg-emerald-500/10 text-emerald-100`
- Inativo: `border-white/10 bg-zinc-950/40 text-gray-300`

### Alertas
- `border-amber-400/30 bg-amber-500/10 text-amber-200`

### Subcards (stats)
- `rounded-xl border border-white/10 bg-zinc-950/40 p-4 text-center`

## Interacoes
- Hover suave (borda + texto)
- Desabilitado: `cursor-not-allowed opacity-40`
- Feedback de carregamento: texto `text-xs text-gray-500` ou `text-amber-300`

## Menus e overlays
- DropdownMenu (variaveis): fundo `bg-zinc-900`, borda `border-white/10`
- Sheet lateral (UF): `bg-zinc-950`, borda lateral `border-white/10`
- Dialog (calendario): `bg-black` + overlay `bg-black/70`

## Estrutura de pagina recomendada
1) Header com breadcrumb textual + H1
2) Stepper horizontal
3) Cards do passo (1 por vez)
4) Rodape com Voltar + mensagem + CTA
5) Right rail com Resumo + Preview

## Checklist para novas telas
- Usar Card base + labels uppercase
- Inputs sempre em `bg-zinc-950/40` e borda `border-white/10`
- Estado ativo sempre emerald
- Estado alerta sempre amber
- CTA final sempre branco (alto contraste)
- Sem cores novas fora do trio: zinc / emerald / amber

## Referencia principal
- `app/(dashboard)/campaigns/new/page.tsx`
