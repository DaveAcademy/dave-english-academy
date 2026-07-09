# Dave Academy — Web App

A student management app for Dave English Academy — students, payments,
attendance, and rankings, with real login and roles (administrator, teacher,
student), backed by a real online database (Supabase).

Live at: https://dave-english-academy.vercel.app

## What's included

- **Students**: add, edit, delete, search, filter (level/status/group), sort, bulk import
- **Payments**: monthly fees in UZS, Paid/Unpaid tracking, Due Today / Due in 7 Days / Overdue views, expected vs. collected totals
- **Attendance**: daily Present/Late/Absent per student
- **Rankings**: monthly leaderboard based on attendance
- **Accounts & roles**: administrator (full access), teacher (view students/payments, mark attendance), student (own data only) — enforced by database row-level security, not just the UI
- **Settings**: account/sign-out, JSON backup/restore (admin-only restore), and admin-only account creation
- **Installable PWA**: add it to your phone's home screen like a real app
- Responsive: a sidebar + table layout on desktop, a bottom nav + card layout on phones

## Architecture

- **Frontend**: React + Vite + Tailwind, deployed on Vercel
- **Backend**: Supabase (Postgres + Auth + Edge Functions)
  - `src/lib/db.js` re-exports `src/lib/storageBridge.js`, which is the only
    place the app talks to the database — every page goes through
    `useAcademyData.js` / `AcademyDataContext.jsx`
  - `src/lib/auth.js` + `src/lib/AuthContext.jsx` + `src/components/auth/`
    handle sign up/in/out and the First-Time-Setup bootstrap flow
  - `supabase/migrations/` — schema, roles, RLS policies (apply in numeric order)
  - `supabase/functions/admin-create-user/` — Edge Function an administrator
    calls to create teacher/student login accounts with a generated password

### First-time setup

On a fresh database (no administrator yet), the app shows a First-Time Setup
screen instead of Login. Whoever completes it first becomes the permanent
administrator; after that, everyone always sees the normal Login screen.

## Project structure

```
dave-english-academy/
├── public/
│   └── icons/                          # App icons for the home-screen install
├── src/
│   ├── lib/
│   │   ├── supabaseClient.js           # Supabase client (env-driven)
│   │   ├── db.js                       # re-exports storageBridge.js
│   │   ├── storageBridge.js            # ALL data storage goes through here
│   │   ├── auth.js                     # signUp/signIn/signOut/session helpers
│   │   ├── AuthContext.jsx             # session/profile/role context
│   │   ├── backup.js                   # Manual + automatic local backup
│   │   ├── useAcademyData.js           # Loads data, exposes add/edit/delete functions
│   │   └── AcademyDataContext.jsx
│   ├── components/
│   │   ├── auth/                       # Login, FirstTimeSetup, AuthGate
│   │   ├── admin/                      # CreateUserForm (admin-only)
│   │   └── ...                         # Nav, forms, badges, dialogs
│   ├── pages/                          # One file per screen
│   ├── utils/                          # Formatting, date math, roster-paste parser
│   ├── App.jsx
│   └── main.jsx
├── supabase/
│   ├── migrations/                     # Apply in numeric order
│   └── functions/admin-create-user/
├── vercel.json                         # Vercel SPA rewrite config
└── package.json
```

## Environment variables

Required for the app to run at all — get these from your Supabase project's
**Settings → API**:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Locally, put these in a `.env.local` file (already gitignored — never commit
it). On Vercel, set them under **Project → Settings → Environment
Variables**, for **Production**, **Preview**, and **Development** — a
Preview deployment without these will build fine but be broken at runtime.

The Supabase **service role key** is never used client-side or in this repo —
it's only used inside the `admin-create-user` Edge Function, where Supabase
injects it automatically.

## Running it locally

You'll need [Node.js](https://nodejs.org) 18 or later, and a Supabase
project with the migrations in `supabase/migrations/` applied.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Deploying

This project deploys to Vercel. Framework preset **Vite** is auto-detected;
set the two environment variables above for all three environments, then
deploy. If the Vercel project is connected to this GitHub repo, every push
to `main` deploys automatically; otherwise deploy manually with the Vercel
CLI (`vercel deploy --prod`).

## Installing it on your phone

Once deployed, open the live URL in Chrome (Android) or Safari (iPhone):
- **Android/Chrome**: tap the menu (⋮) → **Add to Home Screen** / **Install app**
- **iPhone/Safari**: tap the Share icon → **Add to Home Screen**

It'll then open full-screen from your home screen like any other app.
