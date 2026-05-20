import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listMine, listRecent } from '@/api/activity'
import type { ActivityEvent } from '@/api/types'

const POLL_INTERVAL_MS = 30_000

export const useActivityStore = defineStore('activity', () => {
  const recent = ref<ActivityEvent[]>([])
  const mine = ref<ActivityEvent[]>([])
  const loadingRecent = ref(false)
  const loadingMine = ref(false)
  const error = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function loadRecent(): Promise<void> {
    loadingRecent.value = true
    try {
      recent.value = await listRecent()
    } catch (err) {
      error.value = (err as Error).message || 'Failed to load activity feed'
    } finally {
      loadingRecent.value = false
    }
  }

  async function loadMine(): Promise<void> {
    loadingMine.value = true
    try {
      mine.value = await listMine()
    } catch (err) {
      error.value =
        (err as Error).message || 'Failed to load your activity feed'
    } finally {
      loadingMine.value = false
    }
  }

  function startGlobalPolling(): void {
    if (pollTimer !== null) return
    void loadRecent()
    pollTimer = setInterval(() => {
      void loadRecent()
    }, POLL_INTERVAL_MS)
  }

  function stopGlobalPolling(): void {
    if (pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  function reset(): void {
    stopGlobalPolling()
    recent.value = []
    mine.value = []
    loadingRecent.value = false
    loadingMine.value = false
    error.value = null
  }

  return {
    recent,
    mine,
    loadingRecent,
    loadingMine,
    error,
    loadRecent,
    loadMine,
    startGlobalPolling,
    stopGlobalPolling,
    reset,
  }
})
