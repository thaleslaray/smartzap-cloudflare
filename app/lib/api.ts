export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const REQUEST_TIMEOUT_MS = 60_000

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(path, {
      ...init, signal,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new ApiError(504, 'a operação demorou demais; tente novamente')
    throw error
  }
  if (res.status === 401 && location.pathname !== '/login') {
    location.href = '/login'
    throw new ApiError(401, 'não autenticado')
  }
  let data: { error?: string; detail?: string }
  try {
    data = (await res.json()) as { error?: string; detail?: string }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (res.ok)
      throw new ApiError(502, 'o servidor retornou uma resposta incompleta; tente novamente')
    data = {}
  }
  if (!res.ok) throw new ApiError(res.status, data.detail ?? data.error ?? `HTTP ${res.status}`)
  return data as T
}
