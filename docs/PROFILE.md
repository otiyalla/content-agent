# Instagram profile setup

The Instagram API can't edit the bio, the link or Highlights, so these are set by hand in the app.
`npm run golive:check` checks the link and the safety line once they're in place.

## 1. Name and bio

**Name** (searchable, keep as is): `Zenlot | Forex Trading Journal`

**Bio** (148 of 150 characters):

```
Free forex trading journal for iOS & Android
Plan, record and review every trade against your rules
We never DM you for money · Not financial advice
```

The last line protects followers from copycat accounts, which commonly target new forex brands, and keeps
the disclaimer visible.

## 2. Link in bio

Set the link to **`https://info.zenlot.net/ig`**. It's the page from the `zenlot-info.github.io` repo (`ig/index.html`).

- **Google Play** installs are tagged `utm_source=instagram`, `utm_campaign=ig_<ISO week>` (for example
  `ig_2026-W48`) and `utm_content=bio`. You'll see them in Play Console → Statistics → Acquisition. The
  week changes automatically, so the bio never needs editing.
- **App Store** campaigns need your provider token. In App Store Connect → App Analytics → Acquisition →
  Campaigns → *Generate a campaign link*, copy the `pt=` number into `APP_STORE_PT` in `ig/index.html`.
  Until then the App Store button works but isn't counted.
- To tag one post (for example a Story link sticker), link to `https://info.zenlot.net/ig?p=2026-W48-sat`.

## 3. Highlights

Run `npm run ig:profile-assets`. It writes these to `out/instagram/profile/`:

| File | Use |
|---|---|
| `story-stay-safe.jpg` | Post as a Story, then add it to a **Safety** Highlight |
| `cover-safety.jpg` | Cover for **Safety** |
| `cover-start-here.jpg` | Cover for **Start here**: add the welcome post's Story reshare |
| `cover-risk-maths.jpg` | Cover for **Risk maths**: add Story reshares of the maths carousels as they publish |

Order: Safety first, then Start here, then Risk maths. Covers are cropped to a circle from the centre.

## 4. Pinned posts

Pin up to 3 posts so a new visitor sees what the account is about:

1. The welcome post (2026-W47).
2. The best-saved maths carousel. Until there's data, use W48 Monday ("A 50% loss needs a 100% gain").
3. The latest product post (W48 Saturday once it's out).

Review the pins once a month against saves and follows.

## 5. Other profiles

Use the same safety line and link everywhere, so followers can tell the real accounts apart:

- **X bio:** `Free forex trading journal for iOS & Android. We never DM you for money. Not financial advice.`
  Link: `https://info.zenlot.net/ig`
- **Reddit profile** (`u/` of the agent account): `Founder of Zenlot, a free forex trading journal. I never DM for money.`
- Each profile links to the other two: Instagram ↔ X ↔ Reddit.
