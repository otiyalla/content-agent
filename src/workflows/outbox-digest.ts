import { outbox } from '../services/outbox.service';

// ---------------------------------------------------------------------------
// Daily X/Reddit digest: emails the best few drafts the agents held since the
// last digest (with the original post quoted), then clears the queue.
//
//   npm run run:digest
// ---------------------------------------------------------------------------

outbox
  .sendDigest()
  .then(({ sent, dropped }) => console.log(`✅ Digest: ${sent} draft(s) sent, ${dropped} skipped`))
  .catch((err) => {
    console.error('❌ Digest failed:', err);
    process.exit(1);
  });
