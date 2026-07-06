# Upgrading to Supabase (a real online database)

This app currently saves data in your browser's local storage. That works well for
one person on one device, but it won't sync across devices and can be lost if you
clear your browser data. When you're ready for real cloud storage, here's the path.

**You do not need to do this now.** Everything works today without it. Come back to
this file whenever you want your data to sync across devices or be backed up online
automatically.

## Why Supabase

Supabase gives you a free, hosted Postgres database with a simple JavaScript client.
The free tier is generous enough for a single school's data for years.

## Steps

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Create a new project, choose a region close to you, set a database password
3. Once it's ready, go to **Project Settings → API** and copy your **Project URL** and **anon public key**

### 2. Create the tables
In Supabase, go to the **SQL Editor** and run:

```sql
create table students (
  id bigint generated always as identity primary key,
  real_name text not null,
  english_name text,
  level text not null check (level in ('A', 'B', 'C')),
  group_name text,
  phone text,
  parent_phone text,
  join_date date not null,
  payment_deadline integer not null check (payment_deadline between 1 and 31),
  monthly_fee numeric not null default 0,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes text,
  created_at timestamptz not null default now()
);

create table payments (
  id bigint generated always as identity primary key,
  student_id bigint references students(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  paid boolean not null default false,
  paid_date date
);

create table attendance (
  id bigint generated always as identity primary key,
  student_id bigint references students(id) on delete cascade,
  date date not null,
  status text not null check (status in ('Present', 'Late', 'Absent'))
);
```

### 3. Install the Supabase client
```bash
npm install @supabase/supabase-js
```

### 4. Add your keys as environment variables
Create a `.env.local` file (never commit this):
```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Rewrite `src/lib/db.js`
Replace the localStorage-based functions with Supabase calls. The function
names and shapes should stay the same so nothing else in the app needs to
change. Example for the students functions:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function listStudents() {
  const { data, error } = await supabase.from('students').select('*');
  if (error) throw error;
  return data;
}

export async function createStudent(data) {
  const { data: record, error } = await supabase.from('students').insert(data).select().single();
  if (error) throw error;
  return record;
}

// ...and so on for updateStudent, deleteStudent, listPayments, etc.
// Each function keeps the same name and return shape as the localStorage version.
```

### 6. Add your environment variables to your host
When you deploy (Vercel/Netlify/Cloudflare Pages), add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in that host's dashboard under Environment Variables,
then redeploy.

That's it — every page keeps working exactly as before, just backed by a real
database instead of your browser.
