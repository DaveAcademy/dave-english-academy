# Dave English Academy — Web App

A complete, installable web app for managing students, payments, attendance, and
rankings — works on your phone and on a computer, and keeps working once
installed even without a signal.

## What's included

- **Students**: add, edit, delete, search, filter (level/status/group), sort, bulk import
- **Payments**: monthly fees in UZS, Paid/Unpaid tracking, Due Today / Due in 7 Days / Overdue views, expected vs. collected totals
- **Attendance**: daily Present/Late/Absent per student
- **Rankings**: monthly leaderboard based on attendance
- **Settings**: manual backup/restore, and a guide for upgrading storage later
- **Installable PWA**: add it to your phone's home screen like a real app
- Responsive: a sidebar + table layout on desktop, a bottom nav + card layout on phones

## Project structure

```
dave-academy-webapp/
├── public/
│   ├── icons/                  # App icons for the home-screen install
│   └── _redirects              # SPA routing for Netlify/Cloudflare Pages
├── src/
│   ├── lib/
│   │   ├── db.js               # ALL data storage goes through here (see below)
│   │   ├── backup.js           # Manual + automatic local backup
│   │   ├── useAcademyData.js   # Loads data, exposes add/edit/delete functions
│   │   └── AcademyDataContext.jsx
│   ├── components/              # Reusable UI: Nav, forms, badges, dialogs
│   ├── pages/                   # One file per screen
│   ├── utils/                   # Formatting, date math, roster-paste parser
│   ├── App.jsx
│   └── main.jsx
├── vercel.json                  # Vercel deployment config
├── netlify.toml                  # Netlify deployment config
├── SUPABASE_UPGRADE.md           # How to move to a real online database later
└── package.json
```

## How data is stored today

Everything is saved in your browser's local storage - private to your device,
works offline, no account needed. **Go to Settings → Download backup regularly**
and save that file somewhere safe (Google Drive, email to yourself). That backup
file is what actually protects you if you lose your phone or clear your browser.

When you're ready for data that syncs across devices, see `SUPABASE_UPGRADE.md` -
the app is structured so that's a contained change, not a rewrite.

## Running it locally

You'll need [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Part 1: Create a GitHub repository

1. Go to [github.com](https://github.com) and sign up (free) if you don't have an account
2. Click the **+** icon top-right → **New repository**
3. Name it `dave-english-academy` (or anything you like)
4. Leave it **Public** or **Private** — either works for deployment
5. Do **not** check "Add a README" — this project already has one
6. Click **Create repository**

## Part 2: Upload this project to GitHub

This project is already a Git repository (it has a `.git` folder with your first
commit saved). You just need to connect it to the empty repository you made and push.

**If you have a computer with Git installed** (recommended):
1. Unzip this project somewhere on your computer
2. Open a terminal in that folder
3. Run the three commands GitHub shows you after creating the repo — they'll look like:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/dave-english-academy.git
   git branch -M main
   git push -u origin main
   ```
4. Refresh your GitHub repository page — all the files should now be there

**If you don't have Git installed or prefer not to use a terminal:**
1. On your new GitHub repository page, click **uploading an existing file**
2. Unzip this project on your computer, then drag every file and folder into the browser
   (do this in a few batches if GitHub limits how many at once)
3. Scroll down and click **Commit changes**

Either way, once it's uploaded, move on to Part 3.

## Part 3: Deploy for free — step by step

### Option A: Vercel (recommended - simplest)

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account
2. Click **Add New → Project**
3. Select your `dave-english-academy` repository
4. Leave all settings as detected (Vercel auto-detects Vite) and click **Deploy**
5. Wait about a minute — you'll get a live URL like `dave-english-academy.vercel.app`
6. Open that URL on your phone, then in Chrome's menu tap **Add to Home Screen**

### Option B: Netlify

1. Go to [netlify.com](https://netlify.com) and sign up with GitHub
2. Click **Add new site → Import an existing project**
3. Choose your repository
4. Build command: `npm run build` — Publish directory: `dist` (already set in `netlify.toml`)
5. Click **Deploy site**

### Option C: Cloudflare Pages

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) and sign up
2. Click **Create a project → Connect to Git**
3. Choose your repository
4. Framework preset: **Vite** — Build command: `npm run build` — Output directory: `dist`
5. Click **Save and Deploy**

### After deploying

Every time you (or I, on your behalf) push new changes to the GitHub repository,
your host will automatically rebuild and redeploy the live site within a minute or two.

## Installing it on your phone

Once deployed, open the live URL in Chrome (Android) or Safari (iPhone):
- **Android/Chrome**: tap the menu (⋮) → **Add to Home Screen** / **Install app**
- **iPhone/Safari**: tap the Share icon → **Add to Home Screen**

It'll then open full-screen from your home screen like any other app.
