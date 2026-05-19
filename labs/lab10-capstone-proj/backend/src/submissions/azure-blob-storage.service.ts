import { randomUUID } from 'crypto';
import {
  BlobServiceClient,
  ContainerClient,
  PublicAccessType,
} from '@azure/storage-blob';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AzureBlobStorageService {
  private readonly blobServiceClient: BlobServiceClient;
  private readonly containerName: string;
  private containerReady = false;
  private containerClient?: ContainerClient;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
    );
    this.containerName =
      config.get<string>('AZURE_STORAGE_SUBMISSIONS_CONTAINER') ??
      'submissions';
    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
  }

  buildObjectKey(
    userId: string,
    enrollmentId: string,
    filename: string,
  ): string {
    const sanitized = this.sanitizeFilename(filename);
    return `${userId}/${enrollmentId}/${randomUUID()}-${sanitized}`;
  }

  async upload(
    buffer: Buffer,
    contentType: string,
    objectKey: string,
  ): Promise<{ blobUrl: string; objectKey: string }> {
    const container = await this.getContainer();
    const blockBlobClient = container.getBlockBlobClient(objectKey);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return { blobUrl: blockBlobClient.url, objectKey };
  }

  async delete(objectKey: string): Promise<void> {
    const container = await this.getContainer();
    await container.deleteBlob(objectKey, {
      deleteSnapshots: 'include',
    });
  }

  private async getContainer(): Promise<ContainerClient> {
    if (this.containerReady && this.containerClient) {
      return this.containerClient;
    }
    const client = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    await client.createIfNotExists({ access: 'blob' as PublicAccessType });
    // Ensure public blob access even if the container already existed without it
    await client.setAccessPolicy('blob');
    this.containerClient = client;
    this.containerReady = true;
    return client;
  }

  private sanitizeFilename(name: string): string {
    const stripped = name
      .replace(/[/\\]/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/^\.+/, '');
    const safe = stripped.length > 0 ? stripped : 'file';
    return safe.slice(0, 100);
  }
}
