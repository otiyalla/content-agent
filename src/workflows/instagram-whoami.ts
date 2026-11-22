import 'dotenv/config';

// Prints the Instagram account behind IG_ACCESS_TOKEN, including the numeric
// user ID to put in IG_USER_ID. Only needs IG_ACCESS_TOKEN to be set.
//
//   npm run ig:whoami

async function main() {
  if (!process.env.IG_ACCESS_TOKEN) throw new Error('Set IG_ACCESS_TOKEN in .env first');
  // The service is configured when env.ts loads, so the placeholder must be set before importing it.
  process.env.IG_USER_ID ||= 'me';
  const { instagramService } = await import('../services/social/instagram.service');
  const a = (await instagramService.getAccount()) as {
    user_id?: string;
    username: string;
    followers_count?: number;
    media_count?: number;
  };
  console.log(`Account:   @${a.username}`);
  console.log(`IG_USER_ID=${a.user_id ?? '(not returned)'}`);
  console.log(`Followers: ${a.followers_count ?? '?'} · Posts: ${a.media_count ?? '?'}`);
  console.log(`API host:  ${(await import('../services/social/instagram.service')).tokenKind() === 'facebook' ? 'graph.facebook.com (system-user token, never expires)' : 'graph.instagram.com (60-day token)'}`);
  try {
    const limit = await instagramService.getPublishingLimit();
    console.log(`Publishing: allowed — ${limit.quota_usage ?? 0}/${limit.config?.quota_total ?? '?'} API posts used in the last 24h`);
  } catch (err) {
    console.log(`Publishing: ❌ ${err instanceof Error ? err.message : err}`);
  }
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
