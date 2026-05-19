export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export type ChallengeStatus = 'open' | 'closed'

export interface Challenge {
  id: string
  ownerId: string
  title: string
  description: string
  requiredSkills: string[]
  deadline: string
  maxEnrollments: number | null
  status: ChallengeStatus
  createdAt: string
  enrollmentsCount: number
}

export interface ChallengeListResponse {
  items: Challenge[]
  page: number
  limit: number
  total: number
}

export interface CreateChallengeDto {
  title: string
  description: string
  requiredSkills: string[]
  deadline: string
  maxEnrollments?: number | null
}

export interface UpdateChallengeDto {
  title?: string
  description?: string
  requiredSkills?: string[]
  deadline?: string
  maxEnrollments?: number | null
  status?: ChallengeStatus
}

export interface ListChallengesParams {
  page?: number
  limit?: number
  status?: ChallengeStatus
  skill?: string
}

export type EnrollmentStatus =
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'

export interface Enrollment {
  id: string
  challengeId: string
  userId: string
  status: EnrollmentStatus
  enrolledAt: string
}

export interface MyEnrollmentChallengeSummary {
  id: string
  title: string
  deadline: string
  status: ChallengeStatus
  requiredSkills: string[]
}

export interface MyEnrollment extends Enrollment {
  challenge: MyEnrollmentChallengeSummary
}
