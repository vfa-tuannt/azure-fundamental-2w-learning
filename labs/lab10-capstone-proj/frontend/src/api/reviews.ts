import api from './axios'
import type { ChallengeSubmission, Submission } from './types'

export async function listForChallenge(
  challengeId: string,
): Promise<ChallengeSubmission[]> {
  const res = await api.get<ChallengeSubmission[]>(
    `/challenges/${challengeId}/submissions`,
  )
  return res.data
}

export async function approve(submissionId: string): Promise<Submission> {
  const res = await api.post<Submission>(
    `/submissions/${submissionId}/approve`,
  )
  return res.data
}

export async function reject(
  submissionId: string,
  reason?: string,
): Promise<Submission> {
  const body = reason !== undefined ? { reason } : {}
  const res = await api.post<Submission>(
    `/submissions/${submissionId}/reject`,
    body,
  )
  return res.data
}
