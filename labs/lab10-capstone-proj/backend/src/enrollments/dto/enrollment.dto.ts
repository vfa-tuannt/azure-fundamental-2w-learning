import { EnrollmentStatus } from '../enrollment-status.enum';

export interface EnrollmentDto {
  id: string;
  challengeId: string;
  userId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
}
