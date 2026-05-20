import api from './axios'
import type { MyStats } from './types'

export async function getMyStats(): Promise<MyStats> {
  const res = await api.get<MyStats>('/me/stats')
  return res.data
}
