import { AxiosError } from 'axios'
import api from './axios'
import type { Enrollment, MyEnrollment } from './types'

export async function enroll(challengeId: string): Promise<Enrollment> {
  const res = await api.post<Enrollment>(`/challenges/${challengeId}/enroll`)
  return res.data
}

export async function withdraw(challengeId: string): Promise<void> {
  await api.delete(`/challenges/${challengeId}/enroll`)
}

export async function getMyEnrollments(): Promise<MyEnrollment[]> {
  const res = await api.get<MyEnrollment[]>('/me/enrollments')
  return res.data
}

export async function getMyEnrollmentForChallenge(
  challengeId: string,
): Promise<Enrollment | null> {
  try {
    const res = await api.get<Enrollment>(
      `/challenges/${challengeId}/enrollment`,
    )
    return res.data
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      return null
    }
    throw err
  }
}
