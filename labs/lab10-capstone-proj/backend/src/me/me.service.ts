import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Challenge } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { MyStatsDto } from './dto/my-stats.dto';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
  ) {}

  async getStats(userId: string): Promise<MyStatsDto> {
    const [challengesCreated, enrollmentsActive, enrollmentsApproved] =
      await Promise.all([
        this.challenges.count({
          where: { ownerId: userId, deletedAt: IsNull() },
        }),
        this.enrollments
          .createQueryBuilder('e')
          .where('e.user_id = :userId', { userId })
          .andWhere('e.status IN (:...active)', {
            active: [EnrollmentStatus.IN_PROGRESS, EnrollmentStatus.SUBMITTED],
          })
          .getCount(),
        this.enrollments.count({
          where: { userId, status: EnrollmentStatus.APPROVED },
        }),
      ]);
    return { challengesCreated, enrollmentsActive, enrollmentsApproved };
  }
}
