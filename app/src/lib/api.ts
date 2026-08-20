import type { Touchpoint } from '../types'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function listarTouchpoints(): Promise<Touchpoint[]> {
  const res = await fetch('/api/touchpoints')
  return handleResponse<Touchpoint[]>(res)
}

export async function crearTouchpoint(touchpoint: Omit<Touchpoint, 'id'> & { id?: string }): Promise<void> {
  const res = await fetch('/api/touchpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(touchpoint),
  })
  await handleResponse<{ ok: true }>(res)
}

export async function actualizarTouchpoint(id: string, cambios: Partial<Omit<Touchpoint, 'id'>>): Promise<void> {
  const res = await fetch(`/api/touchpoints/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  })
  await handleResponse<{ ok: true }>(res)
}

export async function eliminarTouchpoint(id: string): Promise<void> {
  const res = await fetch(`/api/touchpoints/${id}`, { method: 'DELETE' })
  await handleResponse<{ ok: true }>(res)
}
