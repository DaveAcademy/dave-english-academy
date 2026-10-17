# Deployment

## Production Configuration

| Field | Value |
|-------|-------|
| Vercel project | `dave-english-academy` |
| Vercel team | `student-management-system2` |
| Production branch | `release/dashboard-redesign` |
| Framework | Vite / React |
| Build command | `npm run build` |
| Node.js | 24.x |
| Production URL | `https://dave-english-academy.vercel.app` |
| Aliases | `https://davenglish.uz`, `https://www.davenglish.uz` |

## Build

```bash
npm install
npm run build
```

Build output goes to `dist/`. Vite handles code splitting automatically.

## Preview Deployment

Pushes to non-production branches trigger Vercel preview deployments automatically.

## Production Deployment

1. Ensure all changes are committed to `release/dashboard-redesign`
2. Push to remote:
   ```bash
   git push origin release/dashboard-redesign
   ```
3. Vercel auto-deploys from the production branch
4. Verify deployment at `https://dave-english-academy.vercel.app`

## Manual Deployment

```bash
# Link to the correct project first
vercel link --project dave-english-academy --scope student-management-system2

# Deploy to production
vercel --yes --prod
```

## Required Environment

Supabase configuration is in `src/lib/supabaseClient.js` and `.env.local`. No additional environment variables are needed for the frontend build.

## Verification

After deployment:
1. Visit `https://dave-english-academy.vercel.app`
2. Verify login works
3. Verify student portal loads
4. Verify admin/teacher dashboard loads
5. Verify games route works
6. Verify no console errors

## Rollback

If deployment causes issues:
1. Go to Vercel dashboard
2. Find the last known good deployment
3. Promote it to production

Do NOT deploy from `main`. The `main` branch is stale and does not contain game code.
