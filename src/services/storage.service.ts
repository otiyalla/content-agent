import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Cloudflare R2 storage (S3-compatible). Instagram's publishing API pulls
// images from a public URL, so every rendered slide is uploaded here first.
// ---------------------------------------------------------------------------

export class StorageService {
  private client: S3Client | null = null;

  get configured(): boolean {
    return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_PUBLIC_BASE_URL);
  }

  private getClient(): S3Client {
    if (!this.configured) throw new Error('R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_BASE_URL)');
    this.client ??= new S3Client({
      region: 'auto',
      // Accept either the bare account ID or the full S3 endpoint URL Cloudflare shows.
      endpoint: `https://${env.R2_ACCOUNT_ID!.replace(/^https?:\/\//, '').replace(/\.r2\.cloudflarestorage\.com.*$/, '')}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    });
    return this.client;
  }

  publicUrl(key: string): string {
    return `${env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`;
  }

  /** Uploads a JPEG and returns its public URL. Keys are content-addressed, so re-uploads are idempotent. */
  async uploadJpeg(key: string, data: Buffer): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: data,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicUrl(key);
  }

  async delete(key: string): Promise<void> {
    await this.getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  }
}

export const storageService = new StorageService();
