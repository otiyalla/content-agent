import fs from 'fs';
import { instagramService } from '../services/social/instagram.service';

// ---------------------------------------------------------------------------
// Refreshes the long-lived Instagram token (valid 60 days) and writes the new
// token to the file given as the first argument. The GitHub Action then stores
// it back into the IG_ACCESS_TOKEN repository secret. Run weekly.
//
//   ts-node src/workflows/instagram-token.ts /path/to/output
// ---------------------------------------------------------------------------

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Usage: instagram-token.ts <output-file>');
  if (!instagramService.configured) {
    console.log('Instagram not configured — nothing to refresh.');
    return;
  }
  if (!instagramService.tokenExpires) {
    console.log('System-user token (never expires) — no refresh needed.');
    return;
  }
  const { access_token, expires_in } = await instagramService.refreshToken();
  fs.writeFileSync(out, access_token, { mode: 0o600 });
  console.log(`🔑 Token refreshed — valid for ${Math.round(expires_in / 86400)} more days`);
}

main().catch((err) => {
  console.error('❌ Token refresh failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
