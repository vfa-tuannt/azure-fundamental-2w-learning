import { EnrollmentStatus } from '../../enrollments/enrollment-status.enum';
import { SubmissionDto } from '../../submissions/dto/submission.dto';

export interface ChallengeSubmissionEnrollment {
  id: string;
  userId: string;
  status: EnrollmentStatus;
}

export interface ChallengeSubmissionSubmitter {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface ChallengeSubmissionDto extends SubmissionDto {
  enrollment: ChallengeSubmissionEnrollment;
  submitter: ChallengeSubmissionSubmitter;
}
