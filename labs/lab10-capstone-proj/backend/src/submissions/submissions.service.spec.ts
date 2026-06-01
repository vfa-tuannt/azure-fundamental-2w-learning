import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { Challenge, ChallengeStatus } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { AzureBlobStorageService } from './azure-blob-storage.service';
import { Submission } from './submission.entity';
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  SubmissionsService,
} from './submissions.service';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const STRANGER_ID = '00000000-0000-0000-0000-00000000000c';
const CHALLENGE_ID = '00000000-0000-0000-0000-0000000000aa';
const ENROLLMENT_ID = '00000000-0000-0000-0000-0000000000bb';
const SUBMISSION_ID = '00000000-0000-0000-0000-0000000000cc';

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function buildChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: CHALLENGE_ID,
    ownerId: OWNER_ID,
    owner: undefined as never,
    title: 'Test',
    description: 'Body',
    requiredSkills: [],
    deadline: new Date('2099-01-01T00:00:00Z'),
    maxEnrollments: null,
    status: ChallengeStatus.OPEN,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: ENROLLMENT_ID,
    challengeId: CHALLENGE_ID,
    challenge: buildChallenge(),
    userId: USER_ID,
    user: undefined as never,
    status: EnrollmentStatus.IN_PROGRESS,
    enrolledAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: SUBMISSION_ID,
    enrollmentId: ENROLLMENT_ID,
    enrollment: undefined as never,
    blobUrl: 'https://example/devstoreaccount1/submissions/x/y/uuid-file.pdf',
    externalUrl: null,
    notes: '',
    submittedAt: new Date('2024-01-03T00:00:00Z'),
    rejectionReason: null,
    reviewedAt: null,
    ...overrides,
  };
}

function makeFile(
  buffer: Buffer,
  mimetype: string,
  size = buffer.length,
  originalname = 'report.pdf',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

interface TxRepos {
  enrollments: jest.Mocked<Repository<Enrollment>> & {
    createQueryBuilder: jest.Mock;
  };
  submissions: jest.Mocked<Repository<Submission>>;
  qb: {
    setLock: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
}

function buildTxRepos(): TxRepos {
  const qb = {
    setLock: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn(),
  };
  qb.setLock.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  const enrollments: Partial<jest.Mocked<Repository<Enrollment>>> & {
    createQueryBuilder?: jest.Mock;
  } = {
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const submissions: Partial<jest.Mocked<Repository<Submission>>> = {
    create: jest.fn(),
    save: jest.fn(),
  };
  return {
    enrollments: enrollments as TxRepos['enrollments'],
    submissions: submissions as TxRepos['submissions'],
    qb,
  };
}

function buildDataSource(tx: TxRepos): DataSource {
  return {
    transaction: jest
      .fn()
      .mockImplementation(async (_levelOrFn: unknown, maybeFn?: unknown) => {
        const fn = (
          typeof _levelOrFn === 'function' ? _levelOrFn : maybeFn
        ) as (manager: unknown) => Promise<unknown>;
        const manager = {
          getRepository(target: unknown) {
            if (target === Enrollment) return tx.enrollments;
            if (target === Submission) return tx.submissions;
            throw new Error('unexpected repo');
          },
        };
        return fn(manager);
      }),
  } as unknown as DataSource;
}

describe('SubmissionsService', () => {
  let service: SubmissionsService;
  let enrollmentsRepo: jest.Mocked<Repository<Enrollment>>;
  let challengesRepo: jest.Mocked<Repository<Challenge>>;
  let submissionsRepo: jest.Mocked<Repository<Submission>>;
  let blobStorage: jest.Mocked<AzureBlobStorageService>;
  let tx: TxRepos;
  let activityRecord: jest.Mock;

  beforeEach(async () => {
    tx = buildTxRepos();
    activityRecord = jest.fn().mockResolvedValue(undefined);
    const enrollmentsRepoMock: Partial<jest.Mocked<Repository<Enrollment>>> = {
      findOne: jest.fn(),
    };
    const challengesRepoMock: Partial<jest.Mocked<Repository<Challenge>>> = {
      findOne: jest.fn(),
    };
    const submissionsRepoMock: Partial<jest.Mocked<Repository<Submission>>> = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const blobStorageMock = {
      buildObjectKey: jest.fn().mockReturnValue('USER/ENROLL/uuid-report.pdf'),
      upload: jest.fn().mockResolvedValue({
        blobUrl:
          'https://example/devstoreaccount1/submissions/USER/ENROLL/uuid-report.pdf',
        objectKey: 'USER/ENROLL/uuid-report.pdf',
      }),
      delete: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        {
          provide: getRepositoryToken(Submission),
          useValue: submissionsRepoMock,
        },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentsRepoMock,
        },
        {
          provide: getRepositoryToken(Challenge),
          useValue: challengesRepoMock,
        },
        { provide: getDataSourceToken(), useValue: buildDataSource(tx) },
        { provide: AzureBlobStorageService, useValue: blobStorageMock },
        { provide: ActivityService, useValue: { record: activityRecord } },
        { provide: TelemetryService, useValue: { trackEvent: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
    enrollmentsRepo = moduleRef.get(getRepositoryToken(Enrollment));
    challengesRepo = moduleRef.get(getRepositoryToken(Challenge));
    submissionsRepo = moduleRef.get(getRepositoryToken(Submission));
    blobStorage = moduleRef.get(AzureBlobStorageService);
  });

  describe('validateFile', () => {
    it('rejects MIME types not on the whitelist', () => {
      expect(() =>
        service.validateFile(
          makeFile(Buffer.from('hi'), 'application/octet-stream'),
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('rejects files larger than 25 MB', () => {
      expect(() =>
        service.validateFile(
          makeFile(PDF_MAGIC, 'application/pdf', MAX_FILE_BYTES + 1),
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('rejects PDF mimetype with wrong magic bytes', () => {
      expect(() =>
        service.validateFile(
          makeFile(Buffer.from('NOTAPDF!'), 'application/pdf'),
        ),
      ).toThrow(UnprocessableEntityException);
    });

    it('accepts valid PDF', () => {
      expect(() =>
        service.validateFile(makeFile(PDF_MAGIC, 'application/pdf')),
      ).not.toThrow();
    });

    it('accepts valid PNG', () => {
      expect(() =>
        service.validateFile(makeFile(PNG_MAGIC, 'image/png')),
      ).not.toThrow();
    });

    it('accepts valid JPEG', () => {
      expect(() =>
        service.validateFile(makeFile(JPEG_MAGIC, 'image/jpeg')),
      ).not.toThrow();
    });

    it('accepts valid ZIP', () => {
      expect(() =>
        service.validateFile(makeFile(ZIP_MAGIC, 'application/zip')),
      ).not.toThrow();
    });

    it('accepts Markdown without magic-byte check', () => {
      expect(() =>
        service.validateFile(
          makeFile(Buffer.from('# heading'), 'text/markdown'),
        ),
      ).not.toThrow();
    });
  });

  describe('createFromFile', () => {
    function primeTransaction(enrollment: Enrollment): void {
      tx.qb.getOne.mockResolvedValue(enrollment);
      tx.submissions.create.mockImplementation(
        (data) =>
          ({
            id: SUBMISSION_ID,
            ...data,
            submittedAt: new Date(),
          }) as Submission,
      );
      tx.submissions.save.mockImplementation((s) =>
        Promise.resolve(s as Submission),
      );
      tx.enrollments.save.mockResolvedValue(undefined as never);
    }

    it('happy path uploads, inserts, flips status to submitted', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction(buildEnrollment());

      const result = await service.createFromFile(
        ENROLLMENT_ID,
        USER_ID,
        makeFile(PDF_MAGIC, 'application/pdf'),
        'note',
      );

      expect(blobStorage.upload).toHaveBeenCalledTimes(1);
      expect(tx.submissions.save).toHaveBeenCalledTimes(1);
      expect(tx.enrollments.save).toHaveBeenCalledTimes(1);
      const lastSavedEnrollment = tx.enrollments.save.mock
        .calls[0][0] as Enrollment;
      expect(lastSavedEnrollment.status).toBe(EnrollmentStatus.SUBMITTED);
      expect(result.blobUrl).toContain('USER/ENROLL/uuid-report.pdf');
      expect(result.externalUrl).toBeNull();
      expect(result.notes).toBe('note');
      expect(activityRecord).toHaveBeenCalledTimes(1);
      expect(activityRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          type: ActivityEventType.SUBMITTED,
          payload: expect.objectContaining({ kind: 'file' }),
        }),
      );
    });

    it('throws NotFoundException when enrollment is missing', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createFromFile(
          ENROLLMENT_ID,
          USER_ID,
          makeFile(PDF_MAGIC, 'application/pdf'),
          undefined,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when caller is not the enrollment owner', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.createFromFile(
          ENROLLMENT_ID,
          STRANGER_ID,
          makeFile(PDF_MAGIC, 'application/pdf'),
          undefined,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is not in_progress', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.SUBMITTED }),
      );
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.createFromFile(
          ENROLLMENT_ID,
          USER_ID,
          makeFile(PDF_MAGIC, 'application/pdf'),
          undefined,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('logs orphan blob key and rethrows when the transaction fails', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      tx.qb.getOne.mockResolvedValue(buildEnrollment());
      tx.submissions.create.mockImplementation((d) => ({ ...d }) as Submission);
      tx.submissions.save.mockRejectedValue(new Error('DB down'));
      const logSpy = jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      await expect(
        service.createFromFile(
          ENROLLMENT_ID,
          USER_ID,
          makeFile(PDF_MAGIC, 'application/pdf'),
          undefined,
        ),
      ).rejects.toThrow('DB down');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Orphan blob created during failed submission'),
      );
    });
  });

  describe('createFromUrl', () => {
    function primeTransaction(): void {
      tx.qb.getOne.mockResolvedValue(buildEnrollment());
      tx.submissions.create.mockImplementation(
        (data) =>
          ({
            id: SUBMISSION_ID,
            ...data,
            submittedAt: new Date(),
          }) as Submission,
      );
      tx.submissions.save.mockImplementation((s) =>
        Promise.resolve(s as Submission),
      );
      tx.enrollments.save.mockResolvedValue(undefined as never);
    }

    it('happy path inserts row with externalUrl set, blobUrl null, and flips status', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction();

      const result = await service.createFromUrl(
        ENROLLMENT_ID,
        USER_ID,
        'https://github.com/u/r',
        'see readme',
      );

      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(result.blobUrl).toBeNull();
      expect(result.externalUrl).toBe('https://github.com/u/r');
      expect(result.notes).toBe('see readme');
      expect(activityRecord).toHaveBeenCalledTimes(1);
      expect(activityRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          type: ActivityEventType.SUBMITTED,
          payload: expect.objectContaining({ kind: 'url' }),
        }),
      );
    });

    it('403 for non-owner', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.createFromUrl(
          ENROLLMENT_ID,
          STRANGER_ID,
          'https://example/x',
          undefined,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('409 for wrong status', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.APPROVED }),
      );
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.createFromUrl(
          ENROLLMENT_ID,
          USER_ID,
          'https://example/x',
          undefined,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listForEnrollment', () => {
    it('visible to enrollment owner', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      submissionsRepo.find.mockResolvedValue([buildSubmission()]);
      const result = await service.listForEnrollment(ENROLLMENT_ID, USER_ID);
      expect(result).toHaveLength(1);
    });

    it('visible to challenge owner', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      submissionsRepo.find.mockResolvedValue([buildSubmission()]);
      const result = await service.listForEnrollment(ENROLLMENT_ID, OWNER_ID);
      expect(result).toHaveLength(1);
    });

    it('403 for unrelated user', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.listForEnrollment(ENROLLMENT_ID, STRANGER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 when enrollment missing', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listForEnrollment(ENROLLMENT_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findById', () => {
    it('visible to enrollment owner', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      const result = await service.findById(SUBMISSION_ID, USER_ID);
      expect(result.id).toBe(SUBMISSION_ID);
    });

    it('visible to challenge owner', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      const result = await service.findById(SUBMISSION_ID, OWNER_ID);
      expect(result.id).toBe(SUBMISSION_ID);
    });

    it('403 otherwise', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.findById(SUBMISSION_ID, STRANGER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 when submission missing', async () => {
      submissionsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findById(SUBMISSION_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('constants', () => {
    it('MAX_FILE_BYTES is 25 MB', () => {
      expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    });
    it('ALLOWED_MIME contains the 5 expected types', () => {
      expect(ALLOWED_MIME).toEqual([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/zip',
        'text/markdown',
      ]);
    });
  });
});
