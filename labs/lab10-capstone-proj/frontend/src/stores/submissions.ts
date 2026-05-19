import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createFileSubmission as apiCreateFile,
  createUrlSubmission as apiCreateUrl,
  listForEnrollment as apiList,
} from '@/api/submissions'
import type { Submission } from '@/api/types'

export const useSubmissionsStore = defineStore('submissions', () => {
  const byEnrollmentId = ref<Map<string, Submission[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadForEnrollment(enrollmentId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await apiList(enrollmentId)
      byEnrollmentId.value.set(enrollmentId, result)
    } catch (err) {
      error.value = (err as Error).message || 'Failed to load submissions'
    } finally {
      loading.value = false
    }
  }

  async function createFileSubmission(
    enrollmentId: string,
    file: File,
    notes?: string,
  ): Promise<Submission> {
    error.value = null
    try {
      const result = await apiCreateFile(enrollmentId, file, notes)
      const existing = byEnrollmentId.value.get(enrollmentId) ?? []
      byEnrollmentId.value.set(enrollmentId, [result, ...existing])
      return result
    } catch (err) {
      error.value = (err as Error).message || 'Failed to submit'
      throw err
    }
  }

  async function createUrlSubmission(
    enrollmentId: string,
    externalUrl: string,
    notes?: string,
  ): Promise<Submission> {
    error.value = null
    try {
      const result = await apiCreateUrl(enrollmentId, externalUrl, notes)
      const existing = byEnrollmentId.value.get(enrollmentId) ?? []
      byEnrollmentId.value.set(enrollmentId, [result, ...existing])
      return result
    } catch (err) {
      error.value = (err as Error).message || 'Failed to submit'
      throw err
    }
  }

  function reset(): void {
    byEnrollmentId.value = new Map()
    loading.value = false
    error.value = null
  }

  return {
    byEnrollmentId,
    loading,
    error,
    loadForEnrollment,
    createFileSubmission,
    createUrlSubmission,
    reset,
  }
})
