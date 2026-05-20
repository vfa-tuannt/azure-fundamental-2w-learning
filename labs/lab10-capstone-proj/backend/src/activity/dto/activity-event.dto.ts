import { ActivityEventType } from '../activity-event-type.enum';

export interface ActivityActor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ChallengeCreatedPayload {
  challengeId: string;
  challengeTitle: string;
}

export interface EnrolledPayload {
  challengeId: string;
  challengeTitle: string;
  enrollmentId: string;
}

export interface SubmittedPayload {
  submissionId: string;
  enrollmentId: string;
  challengeId: string;
  challengeTitle: string;
  kind: 'file' | 'url';
}

export interface ApprovedPayload {
  submissionId: string;
  enrollmentId: string;
  challengeId: string;
  challengeTitle: string;
  reviewerId: string;
}

export interface RejectedPayload {
  submissionId: string;
  enrollmentId: string;
  challengeId: string;
  challengeTitle: string;
  reviewerId: string;
  rejectionReason: string | null;
}

export type ActivityPayload =
  | ChallengeCreatedPayload
  | EnrolledPayload
  | SubmittedPayload
  | ApprovedPayload
  | RejectedPayload;

export interface ActivityEventDto {
  id: string;
  type: ActivityEventType;
  payload: ActivityPayload;
  createdAt: string;
  user: ActivityActor;
}
