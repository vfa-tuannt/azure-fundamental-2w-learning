import { ChallengeStatus } from '../challenge.entity';

export interface ChallengeDto {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  deadline: string;
  maxEnrollments: number | null;
  status: ChallengeStatus;
  createdAt: string;
  enrollmentsCount: number;
}

export interface ChallengeListResponse {
  items: ChallengeDto[];
  page: number;
  limit: number;
  total: number;
}
