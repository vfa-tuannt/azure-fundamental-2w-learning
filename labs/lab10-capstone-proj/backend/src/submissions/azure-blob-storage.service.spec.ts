import { ConfigService } from '@nestjs/config';
import { AzureBlobStorageService } from './azure-blob-storage.service';

interface MockBlockBlobClient {
  url: string;
  uploadData: jest.Mock;
}

interface MockContainerClient {
  createIfNotExists: jest.Mock;
  getBlockBlobClient: jest.Mock<MockBlockBlobClient, [string]>;
  deleteBlob: jest.Mock;
}

const blockBlobInstances: MockBlockBlobClient[] = [];

const containerClient: MockContainerClient = {
  createIfNotExists: jest.fn().mockResolvedValue({ succeeded: true }),
  getBlockBlobClient: jest.fn((key: string) => {
    const inst: MockBlockBlobClient = {
      url: `https://127.0.0.1/devstoreaccount1/submissions/${key}`,
      uploadData: jest.fn().mockResolvedValue(undefined),
    };
    blockBlobInstances.push(inst);
    return inst;
  }),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => containerClient),
    })),
  },
}));

function makeService(): AzureBlobStorageService {
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'AZURE_STORAGE_CONNECTION_STRING')
        return 'UseDevelopmentStorage=true';
      throw new Error(`unexpected key ${key}`);
    },
    get: (key: string) => {
      if (key === 'AZURE_STORAGE_SUBMISSIONS_CONTAINER') return 'submissions';
      return undefined;
    },
  } as unknown as ConfigService;
  return new AzureBlobStorageService(config);
}

describe('AzureBlobStorageService', () => {
  beforeEach(() => {
    containerClient.createIfNotExists.mockClear();
    containerClient.getBlockBlobClient.mockClear();
    containerClient.deleteBlob.mockClear();
    blockBlobInstances.length = 0;
  });

  describe('buildObjectKey', () => {
    it('returns {userId}/{enrollmentId}/{uuid}-{filename}', () => {
      const service = makeService();
      const key = service.buildObjectKey('u1', 'e1', 'report.pdf');
      expect(key).toMatch(/^u1\/e1\/[0-9a-f-]{36}-report\.pdf$/);
    });

    it('strips path separators from the filename', () => {
      const service = makeService();
      const key = service.buildObjectKey('u1', 'e1', '../../etc/passwd');
      expect(key).toMatch(/^u1\/e1\/[0-9a-f-]{36}-etcpasswd$/);
    });

    it('strips control characters', () => {
      const service = makeService();
      const key = service.buildObjectKey('u1', 'e1', 'bad\x00name.pdf');
      expect(key).toMatch(/^u1\/e1\/[0-9a-f-]{36}-badname\.pdf$/);
    });

    it('truncates very long filenames', () => {
      const service = makeService();
      const longName = 'a'.repeat(200) + '.pdf';
      const key = service.buildObjectKey('u1', 'e1', longName);
      const filenamePart = key.split('-').slice(5).join('-');
      expect(filenamePart.length).toBeLessThanOrEqual(100);
    });

    it('falls back to "file" when filename is empty after sanitization', () => {
      const service = makeService();
      const key = service.buildObjectKey('u1', 'e1', '///');
      expect(key).toMatch(/^u1\/e1\/[0-9a-f-]{36}-file$/);
    });
  });

  describe('upload', () => {
    it('creates the container on first use and uploads with the right content type', async () => {
      const service = makeService();
      const buf = Buffer.from('hello');
      const result = await service.upload(buf, 'application/pdf', 'u1/e1/a-b');
      expect(containerClient.createIfNotExists).toHaveBeenCalledWith({
        access: 'blob',
      });
      expect(containerClient.getBlockBlobClient).toHaveBeenCalledWith(
        'u1/e1/a-b',
      );
      expect(blockBlobInstances[0].uploadData).toHaveBeenCalledWith(buf, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      expect(result.objectKey).toBe('u1/e1/a-b');
      expect(result.blobUrl).toContain('/submissions/u1/e1/a-b');
    });

    it('does not re-create the container on subsequent uploads', async () => {
      const service = makeService();
      await service.upload(Buffer.from('a'), 'image/png', 'u/e/x');
      await service.upload(Buffer.from('b'), 'image/png', 'u/e/y');
      expect(containerClient.createIfNotExists).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('forwards to containerClient.deleteBlob with include-snapshots', async () => {
      const service = makeService();
      await service.delete('u1/e1/foo');
      expect(containerClient.deleteBlob).toHaveBeenCalledWith('u1/e1/foo', {
        deleteSnapshots: 'include',
      });
    });
  });
});
