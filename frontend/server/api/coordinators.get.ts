import { kongBffFetch } from '../utils/kongBff'

export interface CoordinatorOption {
  id: string
  name: string
}

/** Names for the "Change coordinator" list. event-service passes them through from user-service. */
export default defineEventHandler(async (event) => {
  const response = await kongBffFetch<{ items?: Array<{ id?: unknown, name?: unknown }> }>(event, '/event-requests/coordinators')
  const items: CoordinatorOption[] = (response.items ?? [])
    .filter((item): item is { id: string, name: string } => typeof item.id === 'string' && typeof item.name === 'string')
    .map(item => ({ id: item.id, name: item.name }))
  return { items }
})
