import api from './axios'
import type {
  Challenge,
  ChallengeListResponse,
  CreateChallengeDto,
  ListChallengesParams,
  UpdateChallengeDto,
} from './types'

function buildParams(params: ListChallengesParams): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  if (params.page !== undefined) out.page = params.page
  if (params.limit !== undefined) out.limit = params.limit
  if (params.status) out.status = params.status
  if (params.skill && params.skill.trim() !== '') out.skill = params.skill.trim()
  return out
}

export async function listChallenges(
  params: ListChallengesParams = {},
): Promise<ChallengeListResponse> {
  const res = await api.get<ChallengeListResponse>('/challenges', {
    params: buildParams(params),
  })
  return res.data
}

export async function getChallenge(id: string): Promise<Challenge> {
  const res = await api.get<Challenge>(`/challenges/${id}`)
  return res.data
}

export async function createChallenge(dto: CreateChallengeDto): Promise<Challenge> {
  const res = await api.post<Challenge>('/challenges', dto)
  return res.data
}

export async function updateChallenge(
  id: string,
  dto: UpdateChallengeDto,
): Promise<Challenge> {
  const res = await api.patch<Challenge>(`/challenges/${id}`, dto)
  return res.data
}

export async function deleteChallenge(id: string): Promise<void> {
  await api.delete(`/challenges/${id}`)
}
