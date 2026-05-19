import api from './axios'
import type { Submission } from './types'

export async function createFileSubmission(
  enrollmentId: string,
  file: File,
  notes?: string,
): Promise<Submission> {
  const form = new FormData()
  form.append('file', file)
  if (notes) {
    form.append('notes', notes)
  }
  const res = await api.post<Submission>(
    `/enrollments/${enrollmentId}/submissions`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data
}

export async function createUrlSubmission(
  enrollmentId: string,
  externalUrl: string,
  notes?: string,
): Promise<Submission> {
  const body: { externalUrl: string; notes?: string } = { externalUrl }
  if (notes) {
    body.notes = notes
  }
  const res = await api.post<Submission>(
    `/enrollments/${enrollmentId}/submissions`,
    body,
  )
  return res.data
}

export async function listForEnrollment(
  enrollmentId: string,
): Promise<Submission[]> {
  const res = await api.get<Submission[]>(
    `/enrollments/${enrollmentId}/submissions`,
  )
  return res.data
}
