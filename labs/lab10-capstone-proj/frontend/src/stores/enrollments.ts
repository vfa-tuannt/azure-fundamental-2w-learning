import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  enroll as apiEnroll,
  getMyEnrollmentForChallenge,
  getMyEnrollments,
  withdraw as apiWithdraw,
} from '@/api/enrollments'
import type { Enrollment, MyEnrollment } from '@/api/types'

export const useEnrollmentsStore = defineStore('enrollments', () => {
  const byChallengeId = ref<Map<string, Enrollment | null>>(new Map())
  const myList = ref<MyEnrollment[]>([])
  const myListLoaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadForChallenge(challengeId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await getMyEnrollmentForChallenge(challengeId)
      byChallengeId.value.set(challengeId, result)
    } catch (err) {
      error.value = (err as Error).message || 'Failed to load enrollment'
    } finally {
      loading.value = false
    }
  }

  async function loadMyList(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      myList.value = await getMyEnrollments()
      myListLoaded.value = true
    } catch (err) {
      error.value = (err as Error).message || 'Failed to load enrollments'
    } finally {
      loading.value = false
    }
  }

  async function enroll(challengeId: string): Promise<Enrollment> {
    error.value = null
    try {
      const result = await apiEnroll(challengeId)
      byChallengeId.value.set(challengeId, result)
      myListLoaded.value = false
      return result
    } catch (err) {
      error.value = (err as Error).message || 'Failed to enroll'
      throw err
    }
  }

  async function withdraw(challengeId: string): Promise<void> {
    error.value = null
    try {
      await apiWithdraw(challengeId)
      byChallengeId.value.set(challengeId, null)
      myListLoaded.value = false
    } catch (err) {
      error.value = (err as Error).message || 'Failed to withdraw'
      throw err
    }
  }

  function reset(): void {
    byChallengeId.value = new Map()
    myList.value = []
    myListLoaded.value = false
    loading.value = false
    error.value = null
  }

  return {
    byChallengeId,
    myList,
    myListLoaded,
    loading,
    error,
    loadForChallenge,
    loadMyList,
    enroll,
    withdraw,
    reset,
  }
})
