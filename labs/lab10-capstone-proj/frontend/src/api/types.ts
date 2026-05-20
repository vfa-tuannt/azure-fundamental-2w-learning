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

export interface Submission {
  id: string
  enrollmentId: string
  blobUrl: string | null
  externalUrl: string | null
  notes: string
  submittedAt: string
  rejectionReason: string | null
  reviewedAt: string | null
}

export interface ChallengeSubmissionEnrollment {
  id: string
  userId: string
  status: EnrollmentStatus
}

export interface ChallengeSubmissionSubmitter {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface ChallengeSubmission extends Submission {
  enrollment: ChallengeSubmissionEnrollment
  submitter: ChallengeSubmissionSubmitter
}

export type ActivityEventType =
  | 'challenge_created'
  | 'enrolled'
  | 'submitted'
  | 'approved'
  | 'rejected'

export interface ChallengeCreatedPayload {
  challengeId: string
  challengeTitle: string
}

export interface EnrolledPayload {
  challengeId: string
  challengeTitle: string
  enrollmentId: string
}

export interface SubmittedPayload {
  submissionId: string
  enrollmentId: string
  challengeId: string
  challengeTitle: string
  kind: 'file' | 'url'
}

export interface ApprovedPayload {
  submissionId: string
  enrollmentId: string
  challengeId: string
  challengeTitle: string
  reviewerId: string
}

export interface RejectedPayload {
  submissionId: string
  enrollmentId: string
  challengeId: string
  challengeTitle: string
  reviewerId: string
  rejectionReason: string | null
}

export type ActivityPayload =
  | ChallengeCreatedPayload
  | EnrolledPayload
  | SubmittedPayload
  | ApprovedPayload
  | RejectedPayload

export interface ActivityActor {
  id: string
  name: string
  avatarUrl: string | null
}

export interface ActivityEventBase<
  T extends ActivityEventType,
  P extends ActivityPayload,
> {
  id: string
  type: T
  payload: P
  createdAt: string
  user: ActivityActor
}

export type ActivityEvent =
  | ActivityEventBase<'challenge_created', ChallengeCreatedPayload>
  | ActivityEventBase<'enrolled', EnrolledPayload>
  | ActivityEventBase<'submitted', SubmittedPayload>
  | ActivityEventBase<'approved', ApprovedPayload>
  | ActivityEventBase<'rejected', RejectedPayload>

export interface MyStats {
  challengesCreated: number
  enrollmentsActive: number
  enrollmentsApproved: number
}
