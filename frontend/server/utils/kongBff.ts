import { getHeader, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { backendFetch, getSessionToken } from './backend'

type ProxyOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * Thin BFF boundary for domain services exposed by Kong.
 *
 * The browser only sees Nuxt `/api/*` routes. These handlers deliberately do
 * not import venue/booking service code or storage; they forward the sealed
 * backend session token and preserve the service response/error contract.
 */
export async function kongBffFetch<T>(event: H3Event, path: string, options: ProxyOptions = {}) {
  const token = await getSessionToken(event)
  return await backendFetch<T>(event, path, { ...options, token })
}

export function pathSegments(event: H3Event): string[] {
  const raw = getRouterParam(event, 'path')
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('/') : []
  return values.filter(Boolean)
}

export function segmentPath(segments: string[]): string {
  return segments.map(segment => encodeURIComponent(segment)).join('/')
}

export function idempotencyHeaders(event: H3Event): Record<string, string> | undefined {
  const key = getHeader(event, 'idempotency-key')
  return key ? { 'Idempotency-Key': key } : undefined
}
