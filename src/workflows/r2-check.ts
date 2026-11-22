import { storageService } from '../services/storage.service';
import { env } from '../config/env';
import { renderSlide } from '../instagram/renderer';

// Verifies Cloudflare R2 end to end without touching Instagram:
//   1. renders a real slide, 2. uploads it, 3. downloads it from the PUBLIC URL
//   (exactly what Instagram will do), 4. deletes it again.
//
//   npm run r2:check

async function main() {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE_URL'].filter(
    (k) => !(env as Record<string, unknown>)[k],
  );
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);

  const image = await renderSlide(
    { layout: 'quote', kicker: 'Test', title: 'R2 connection check', body: 'Delete me', stat: '', items: [], screen: '' },
    0,
    1,
  );
  const key = `healthcheck/r2-check-${Date.now()}.jpg`;

  console.log(`Bucket:  ${env.R2_BUCKET}`);
  const url = await storageService.uploadJpeg(key, image);
  console.log(`Upload:  ✅ ${image.length} bytes → ${url}`);

  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type');
    const body = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new Error(`HTTP ${res.status} — is public access enabled on the bucket?`);
    if (body.length !== image.length) throw new Error(`size mismatch (${body.length} vs ${image.length})`);
    console.log(`Public:  ✅ HTTP ${res.status}, ${type}, Instagram can fetch this`);
  } finally {
    await storageService.delete(key);
    console.log('Cleanup: ✅ test image deleted');
  }
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
