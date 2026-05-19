import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  approve as apiApprove,
  listForChallenge as apiList,
  reject as apiReject,
} from '@/api/reviews'
import type { ChallengeSubmission, Submission } from '@/api/types'

export const useReviewsStore = defineStore('reviews', () => {
  const byChallengeId = ref<Map<string, ChallengeSubmission[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadForChallenge(challengeId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await apiList(challengeId)
      byChallengeId.value.set(challengeId, result)
    } catch (err) {
      error.value = (err as Error).message || 'Failed to load submissions'
      throw err
    } finally {
      loading.value = false
    }
  }

  interface RowLocation {
    list: ChallengeSubmission[]
    index: number
    current: ChallengeSubmission
  }

  function findRow(
    challengeId: string,
    submissionId: string,
  ): RowLocation | null {
    const list = byChallengeId.value.get(challengeId)
    if (!list) return null
    const index = list.findIndex((row) => row.id === submissionId)
    if (index < 0) return null
    const current = list[index]
    if (!current) return null
    return { list, index, current }
  }

  function writeRow(
    challengeId: string,
    loc: RowLocation,
    next: ChallengeSubmission,
  ): void {
    const newList = [...loc.list]
    newList[loc.index] = next
    byChallengeId.value.set(challengeId, newList)
  }

  function applyServerResponse(
    challengeId: string,
    submissionId: string,
    server: Submission,
  ): void {
    const loc = findRow(challengeId, submissionId)
    if (!loc) return
    const nextStatus =
      server.reviewedAt !== null
        ? server.rejectionReason !== null
          ? 'rejected'
          : 'approved'
        : loc.current.enrollment.status
    const next: ChallengeSubmission = {
      ...loc.current,
      ...server,
      enrollment: { ...loc.current.enrollment, status: nextStatus },
    }
    writeRow(challengeId, loc, next)
  }

  async function approve(
    challengeId: string,
    submissionId: string,
  ): Promise<Submission> {
    const loc = findRow(challengeId, submissionId)
    const snapshot = loc ? loc.current : null

    if (loc) {
      const optimistic: ChallengeSubmission = {
        ...loc.current,
        reviewedAt: new Date().toISOString(),
        rejectionReason: null,
        enrollment: { ...loc.current.enrollment, status: 'approved' },
      }
      writeRow(challengeId, loc, optimistic)
    }

    try {
      const result = await apiApprove(submissionId)
      applyServerResponse(challengeId, submissionId, result)
      return result
    } catch (err) {
      if (loc && snapshot) {
        writeRow(challengeId, loc, snapshot)
      }
      error.value = (err as Error).message || 'Failed to approve'
      throw err
    }
  }

  async function reject(
    challengeId: string,
    submissionId: string,
    reason?: string,
  ): Promise<Submission> {
    const loc = findRow(challengeId, submissionId)
    const snapshot = loc ? loc.current : null

    if (loc) {
      const trimmed = reason?.trim() ?? ''
      const optimistic: ChallengeSubmission = {
        ...loc.current,
        reviewedAt: new Date().toISOString(),
        rejectionReason: trimmed.length > 0 ? trimmed : null,
        enrollment: { ...loc.current.enrollment, status: 'rejected' },
      }
      writeRow(challengeId, loc, optimistic)
    }

    try {
      const result = await apiReject(submissionId, reason)
      applyServerResponse(challengeId, submissionId, result)
      return result
    } catch (err) {
      if (loc && snapshot) {
        writeRow(challengeId, loc, snapshot)
      }
      error.value = (err as Error).message || 'Failed to reject'
      throw err
    }
  }

  function reset(): void {
    byChallengeId.value = new Map()
    loading.value = false
    error.value = null
  }

  return {
    byChallengeId,
    loading,
    error,
    loadForChallenge,
    approve,
    reject,
    reset,
  }
})
