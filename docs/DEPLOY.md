# Deploy Isabelle Wallet to Vercel

This takes about 15 minutes. You need a GitHub account, a Vercel account and a Supabase
project. The app is free to run on the Vercel Hobby and Supabase Free plans.

> Never paste secret values (database password, service role key, JWT secret) into the code,
> a commit, or a chat. They only go into Vercel's **Environment Variables** screen.

## 1. Supabase (database + login)

If you already have a Supabase project for the app, skip to step 1.4.

1. Go to https://supabase.com → **New project**. Pick a region close to you (e.g. *East US*)
   and save the database password somewhere safe.
2. Wait until the project is ready.
3. Note these three values:

   | Variable | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → **API** → Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → **API Keys** → *Publishable key* (`sb_publishable_…`). The legacy *anon* key also works. Both are safe to expose — the database is protected by Row Level Security. |
   | `DATABASE_URL` | **Connect** button (top bar) → *Connection string* → **Transaction pooler** (port **6543**). Replace `[YOUR-PASSWORD]` with the database password. **Secret.** |

4. You do **not** need the `service_role` key, the secret key or the JWT secret. The app never uses them.

The tables are created automatically on every Vercel deploy (see step 3), so there is nothing to
run by hand. If you prefer, you can also run `npm run db:migrate` on your computer with
`DATABASE_URL` in `.env.local`.

## 2. Put the code on GitHub

From the project folder:

```bash
git push
```

(Create an empty private repository on GitHub first and add it as the `origin` remote if you
haven't yet. `.env.local` is in `.gitignore`, so your secrets are not uploaded.)

## 3. Create the Vercel project

1. Go to https://vercel.com/new → **Import** your GitHub repository.
2. Framework preset: **Next.js** (detected automatically). Leave build settings as they are —
   Vercel runs the `vercel-build` script, which first applies database migrations and then builds.
3. Open **Environment Variables** and add (for *Production* and *Preview*):

   | Name | Value |
   |---|---|
   | `DATA_BACKEND` | `supabase` |
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1.3 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from step 1.3 |
   | `DATABASE_URL` | from step 1.3 (Transaction pooler, port 6543) |
   | `AI_API_KEY` | *optional* — Anthropic API key for AI explanations |
   | `SITE_URL` | *optional* — your final address, e.g. `https://isabelle-wallet.vercel.app` (used in confirmation emails) |

   Tip: if you connect Supabase through Vercel's **Integrations → Supabase**, the variables it
   creates (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL`…) are recognized
   automatically — you only need to add `DATA_BACKEND=supabase`.
4. Click **Deploy**.

If a variable is missing, the site shows a **"Setup required"** page listing exactly which
variable names to add (never their values). Add them and redeploy.

## 4. Tell Supabase your new address

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://YOUR-PROJECT.vercel.app` (or your custom domain)
- **Redirect URLs**: add `https://YOUR-PROJECT.vercel.app/auth/callback`
  (keep `http://localhost:3000/auth/callback` if you also run the app locally)

Without this, the confirmation email link would point to the wrong place.

## 5. Create your account

1. Open your Vercel URL → **Create account**.
2. Confirm your email from the link Supabase sends.
   (Supabase's built-in email service is rate-limited. For reliable email, set up your own
   SMTP in *Authentication → Emails → SMTP Settings*, or confirm the user manually in
   *Authentication → Users*.)
3. Sign in and follow the setup steps.
4. Turn off new sign-ups so nobody else can create an account:
   Supabase → **Authentication → Sign In / Providers → Allow new users to sign up** → off
   (or set `ALLOW_SIGNUP=false` in Vercel).

## Updating the app

Push to GitHub — Vercel deploys automatically and applies any new database migrations first.
Migrations are recorded in the database, so each one runs only once.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Setup required" page | Add the variable names it lists in Vercel → Settings → Environment Variables, then **Redeploy**. |
| Build fails at "Failed to apply migrations" | `DATABASE_URL` is wrong. Use the **Transaction pooler** string (port 6543) and check the password. |
| Confirmation link opens localhost or fails | Fix **Site URL** and **Redirect URLs** in Supabase (step 4), or set `SITE_URL` in Vercel. |
| "Email rate limit exceeded" | Wait an hour, set up custom SMTP, or confirm the user in Supabase → Authentication → Users. |
| Import or backup restore fails with a large file | Vercel limits uploads to 4.5 MB; the app accepts files up to 4 MB. Split large CSV files. |

## Notes

- The embedded local database (PGlite) is for running on your own computer only. Vercel's file
  system is temporary, so on Vercel the app always uses Supabase.
- `vercel.json` places the server functions in Washington, D.C. (`iad1`), next to Supabase's
  *East US* region. If your Supabase project is elsewhere, change `regions` to the closest one.
- Preview deployments use the same database as production unless you give them different
  variables in Vercel.
