import api from './axios'
import type { ActivityEvent } from './types'

export async function listRecent(): Promise<ActivityEvent[]> {
  const res = await api.get<ActivityEvent[]>('/activity/recent')
  return res.data
}

export async function listMine(): Promise<ActivityEvent[]> {
  const res = await api.get<ActivityEvent[]>('/activity/me')
  return res.data
}
