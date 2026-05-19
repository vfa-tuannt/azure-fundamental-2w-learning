import { ChallengeStatus } from '../../challenges/challenge.entity';
import { EnrollmentDto } from './enrollment.dto';

export interface MyEnrollmentChallengeSummary {
  id: string;
  title: string;
  deadline: string;
  status: ChallengeStatus;
  requiredSkills: string[];
}

export interface MyEnrollmentDto extends EnrollmentDto {
  challenge: MyEnrollmentChallengeSummary;
}
