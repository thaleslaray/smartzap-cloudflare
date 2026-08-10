const INSTANCE_ID = 'smartzap-knowledge'
const MAX_DOCUMENT_CHARS = 500_000

// O parser de PDF só é usado para extrair texto, mas a distribuição legado do
// pdf.js consulta DOMMatrix durante o carregamento. Workers e o ambiente de
// teste não garantem essa API de desenho; este polyfill mínimo evita que uma
// dependência de renderização bloqueie o upload de PDF textual.
function ensurePdfTextRuntime() {
  const runtime = globalThis as unknown as { DOMMatrix?: unknown }
  if (runtime.DOMMatrix) return
  class TextOnlyDOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    constructor(values?: ArrayLike<number>) {
      if (!values) return
      ;[this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(values).slice(0, 6)
    }
    multiplySelf() { return this }
    preMultiplySelf() { return this }
    translateSelf() { return this }
    scaleSelf() { return this }
    rotateSelf() { return this }
    invertSelf() { return this }
    inverse() { return new TextOnlyDOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]) }
  }
  runtime.DOMMatrix = TextOnlyDOMMatrix
}

export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  if (bytes.byteLength < 8 || bytes.byteLength > 20 * 1024 * 1024) throw new Error('PDF inválido ou grande demais')
  ensurePdfTextRuntime()
  // Registra WorkerMessageHandler no próprio módulo principal. Sem este import
  // estático, pdf.js tenta um import dinâmico de `pdf.worker.mjs` em produção,
  // caminho que não existe entre os módulos publicados pelo Worker.
  const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs') as {
    WorkerMessageHandler?: unknown
  }
  ;(globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler?: unknown } }).pdfjsWorker = {
    WorkerMessageHandler: workerModule.WorkerMessageHandler,
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const options: Parameters<typeof getDocument>[0] & { isEvalSupported: boolean; disableWorker: boolean } = {
    // A extração é pequena e ocorre no próprio Worker. Forçar modo sem worker
    // evita que pdf.js tente carregar `pdf.worker.mjs`, que não existe como
    // asset separado depois do bundle do Worker.
    data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, disableWorker: true,
  }
  const pdf = await getDocument(options).promise
  let text = ''
  for (let page = 1; page <= Math.min(pdf.numPages, 500); page++) {
    const content = await (await pdf.getPage(page)).getTextContent()
    text += content.items.map((item) => 'str' in item ? item.str : '').join(' ') + '\n'
    if (text.length > MAX_DOCUMENT_CHARS) throw new Error('PDF possui texto demais')
  }
  return normalizeKnowledgeText('text/plain', text)
}

type AiSearchItem = { id?: string; key?: string; status?: string }
type AiSearchInstance = {
  items: {
    upload(name: string, content: string, options?: { metadata?: Record<string, unknown> }): Promise<AiSearchItem>
    get?(id: string): { info(): Promise<AiSearchItem> }
    delete(id: string): Promise<void>
  }
  search(input: unknown): Promise<unknown>
  update?(input: unknown): Promise<unknown>
}
type AiSearchNamespace = { get(id: string): AiSearchInstance; create(input: { id: string }): Promise<AiSearchInstance> }

function indexFileName(name: string, documentId?: string, mimeType = 'text/markdown') {
  // O Items API determina o parser pelo sufixo do arquivo. O formulário de
  // conhecimento aceita nomes sem extensão e PDFs são convertidos para texto
  // antes deste ponto; portanto nunca repassamos um sufixo que contradiga o
  // conteúdo efetivamente enviado ao AI Search.
  const extension = mimeType === 'text/html'
    ? '.html'
    : mimeType === 'text/plain' || mimeType === 'application/pdf'
      ? '.txt'
      : '.md'
  const stem = name.trim().replace(/\.[a-z0-9]{1,12}$/i, '') || 'documento'
  return `${documentId ? `${documentId}-` : ''}${stem}${extension}`
}

export function normalizeKnowledgeText(mimeType: string, content: string): string {
  const clean = content.replace(/\u0000/g, '').trim()
  if (!clean || clean.length > MAX_DOCUMENT_CHARS) throw new Error('conteúdo do documento inválido ou grande demais')
  if (mimeType === 'text/html') {
    return clean.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return clean
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

async function instance(binding: unknown): Promise<AiSearchInstance> {
  const namespace = binding as AiSearchNamespace | undefined
  if (!namespace || typeof namespace.get !== 'function' || typeof namespace.create !== 'function')
    throw new Error('AI Search indisponível')
  // create é idempotente no nosso adaptador: se a instância já existir, a API
  // rejeita e passamos a usar a existente. Assim o primeiro upload não depende
  // de uma etapa manual escondida no dashboard.
  try { return await namespace.create({ id: INSTANCE_ID }) }
  catch { return namespace.get(INSTANCE_ID) }
}

export async function uploadKnowledgeDocument(
  binding: unknown, name: string, content: string, documentId?: string, mimeType?: string,
) {
  const searchInstance = await instance(binding)
  // O campo precisa estar registrado no índice para que o filtro por agente
  // seja aplicado pelo Vectorize; metadado apenas armazenado não é filtrável.
  if (documentId && searchInstance.update)
    await searchInstance.update({
      custom_metadata: [{ field_name: 'document_id', data_type: 'text' }],
      chunk: true,
      chunk_size: 256,
      chunk_overlap: 20,
      index_method: { vector: true, keyword: true },
      fusion_method: 'rrf',
      indexing_options: { keyword_tokenizer: 'porter' },
      retrieval_options: { keyword_match_mode: 'or' },
    })
  const items = searchInstance.items
  const item = await items.upload(
    indexFileName(name, documentId, mimeType),
    content,
    documentId ? { metadata: { document_id: documentId } } : undefined,
  )
  const id = item.id ?? item.key
  if (!id || typeof id !== 'string')
    throw new Error('AI Search não confirmou o identificador do documento')
  if (item.status === 'error')
    throw new Error('AI Search rejeitou a indexação do documento')
  return { id, status: item.status ?? 'indexing' }
}

export async function knowledgeDocumentIndexStatus(
  binding: unknown,
  itemId: string,
): Promise<'ready' | 'indexing' | 'failed'> {
  const items = (await instance(binding)).items
  if (!items.get) throw new Error('AI Search não oferece consulta de item')
  const item = await items.get(itemId).info()
  if (item.status === 'completed') return 'ready'
  if (['error', 'failed', 'skipped'].includes(String(item.status))) return 'failed'
  return 'indexing'
}

export async function deleteKnowledgeDocument(binding: unknown, itemId: string): Promise<void> {
  try {
    await (await instance(binding)).items.delete(itemId)
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error
      ? String(error.name)
      : ''
    const message = error instanceof Error ? error.message : String(error)
    // A API atual usa `AiSearchItemNotFoundError`; versões anteriores expunham
    // `AiSearchNotFoundError`. Trate ambos como remoção idempotente: um item
    // pode já ter sido removido quando documentos duplicados apontam para o
    // mesmo identificador do AI Search, mas o R2/D1 ainda precisa ser limpo.
    if (/AiSearch.*NotFoundError/.test(name) || /not[ _-]?found|does not exist|404/i.test(message)) return
    throw error
  }
}

export async function searchKnowledge(
  binding: unknown,
  query: string,
  options: { maxResults?: number; scoreThreshold?: number; documentIds?: string[] } = {},
): Promise<unknown> {
  const maxResults = Math.max(1, Math.min(20, Math.trunc(options.maxResults ?? 5)))
  // O AI Search adota 0,4 como limiar padrão. Manter esse valor evita que
  // perguntas naturais sobre fontes curtas sejam descartadas antes da
  // recuperação, mas ainda preserva um piso explícito contra ruído.
  const scoreThreshold = Math.max(0, Math.min(1, options.scoreThreshold ?? 0.4))
  const documentIds = Array.isArray(options.documentIds)
    ? options.documentIds.slice(0, 500)
    : undefined
  return (await instance(binding)).search({
    messages: [{ role: 'user', content: query }],
    ai_search_options: {
      retrieval: {
        max_num_results: maxResults,
        match_threshold: scoreThreshold,
        ...(documentIds ? { filters: { document_id: { $in: documentIds } } } : {}),
      },
    },
  })
}

export async function agentKnowledgeDocumentIds(
  db: D1Database, agentId: string,
): Promise<string[]> {
  return (await db.prepare(
    `SELECT d.id FROM ai_agent_documents ad
     JOIN knowledge_documents d ON d.id=ad.document_id
     WHERE ad.agent_id=?1 AND d.status='ready'
     ORDER BY d.created_at,d.id LIMIT 500`,
  ).bind(agentId).all<{ id: string }>()).results.map((row) => row.id)
}

export function extractKnowledgeSources(result: unknown): string[] {
  const root = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  // O binding atual do AI Search retorna os trechos em `data`. `chunks` é
  // mantido para respostas antigas e fixtures já persistidos.
  const chunks = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.chunks)
      ? root.chunks
      : []
  return chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== 'object') return []
    const row = chunk as Record<string, unknown>
    const text = [row.text, row.content, row.content_text, row.snippet]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    return text ? [text.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 2_000)] : []
  }).slice(0, 20)
}
