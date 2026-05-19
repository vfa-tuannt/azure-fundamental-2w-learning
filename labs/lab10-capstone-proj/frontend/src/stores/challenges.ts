import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listChallenges } from '@/api/challenges'
import type { Challenge, ChallengeStatus, ListChallengesParams } from '@/api/types'

export interface ChallengesFilters {
  skill: string
  status: ChallengeStatus | null
}

const DEFAULT_LIMIT = 20

export const useChallengesStore = defineStore('challenges', () => {
  const items = ref<Challenge[]>([])
  const page = ref(1)
  const limit = ref(DEFAULT_LIMIT)
  const total = ref(0)
  const filters = ref<ChallengesFilters>({ skill: '', status: null })
  const loading = ref(false)
  const error = ref<string | null>(null)

  function buildParams(): ListChallengesParams {
    const params: ListChallengesParams = { page: page.value, limit: limit.value }
    if (filters.value.skill.trim() !== '') params.skill = filters.value.skill.trim()
    if (filters.value.status) params.status = filters.value.status
    return params
  }

  async function fetchList(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await listChallenges(buildParams())
      items.value = res.items
      total.value = res.total
      page.value = res.page
      limit.value = res.limit
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load challenges'
    } finally {
      loading.value = false
    }
  }

  function setFilters(next: Partial<ChallengesFilters>): Promise<void> {
    filters.value = { ...filters.value, ...next }
    page.value = 1
    return fetchList()
  }

  function setPage(next: number): Promise<void> {
    page.value = next
    return fetchList()
  }

  function reset(): void {
    items.value = []
    page.value = 1
    limit.value = DEFAULT_LIMIT
    total.value = 0
    filters.value = { skill: '', status: null }
    loading.value = false
    error.value = null
  }

  return {
    items,
    page,
    limit,
    total,
    filters,
    loading,
    error,
    fetchList,
    setFilters,
    setPage,
    reset,
  }
})
