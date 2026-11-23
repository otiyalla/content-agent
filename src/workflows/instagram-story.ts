import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { storageService } from '../services/storage.service';
import { instagramService } from '../services/social/instagram.service';

// Posts one JPEG as an Instagram Story on our account.
//
//   npm run ig:story -- out/instagram/profile/story-stay-safe.jpg            (dry run)
//   npm run ig:story -- out/instagram/profile/story-stay-safe.jpg --now      (posts live)
//
// The image should be 1080x1920. Adding it to a Highlight is done in the app afterwards.

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const live = args.includes('--now');
  if (!file) throw new Error('Usage: npm run ig:story -- <image.jpg> [--now]');

  const data = readFileSync(file);
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const key = `instagram/stories/${hash}-${basename(file)}`;

  if (!live) {
    console.log(`Dry run: would upload ${file} to R2 as ${key} and post it as a Story. Add --now to post.`);
    return;
  }

  const url = await storageService.uploadJpeg(key, data);
  console.log(`Uploaded: ${url}`);
  const { mediaId } = await instagramService.publishStory(url);
  console.log(`✅ Story published, media id ${mediaId}`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
