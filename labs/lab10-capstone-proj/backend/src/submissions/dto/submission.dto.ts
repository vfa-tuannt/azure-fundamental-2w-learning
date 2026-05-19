export interface SubmissionDto {
  id: string;
  enrollmentId: string;
  blobUrl: string | null;
  externalUrl: string | null;
  notes: string;
  submittedAt: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
}
