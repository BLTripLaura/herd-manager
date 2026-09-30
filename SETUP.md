# Herd Manager: set up your own copy

This gives you your own private goat herd app. Your records live in your own free accounts. Nobody else, including the person who shared it, can see them.

Your copy comes with:
- **A stocked Medicine Cabinet:** 44 common goat medicines with doses, routes, repeat schedules and withdrawal notes. Stock starts at zero, and every medicine is marked "not yet confirmed with vet".
- **Everything else empty:** add your goats by hand, or import a spreadsheet or an EasyKeeper export.
- **Your own logins:** you'll be the owner, and you can add helpers or a shared barn tablet login.

The setup takes about 20 minutes and costs nothing on the free plans.

## What you need
- An email address
- A **GitHub** account (free, github.com). Vercel keeps your copy of the app there.
- A computer is easiest for setup. After that, the app works on phones and tablets.

## Step 1: Make your database (Supabase)
1. Go to [supabase.com](https://supabase.com) and sign up (the free plan is fine).
2. Click **New project**. Pick any name (for example "herd"), make up a **database password**, and **write it down**. Choose the region closest to you, then click **Create new project**. Wait a minute or two while it starts.
3. Click the **Connect** button at the top of the project page. Under **Session pooler**, copy the connection string. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
   Paste it into a note and replace `[YOUR-PASSWORD]` with your database password from step 2. This is your **DATABASE_URL**.
4. Go to **Project Settings**, then **Data API** (or **API**), and copy the **Project URL** (it looks like `https://abcdefgh.supabase.co`). This is your **SUPABASE_URL**.
5. Go to **Project Settings**, then **API Keys**, and copy the **Publishable key** (it starts with `sb_publishable_`). This is your **SUPABASE_PUBLISHABLE_KEY**.

You don't need to build any tables. The app does that itself the first time it opens.

## Step 2: Put the app online (Vercel)
1. Open the **install link**: [Deploy Herd Manager to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBLTripLaura%2Fherd-manager&project-name=my-herd&repository-name=my-herd&env=DATABASE_URL%2CSUPABASE_URL%2CSUPABASE_PUBLISHABLE_KEY&envDescription=Three+values+from+your+free+Supabase+project.+The+setup+guide+shows+where+to+find+each+one.&envLink=https%3A%2F%2Fgithub.com%2FBLTripLaura%2Fherd-manager%2Fblob%2Fmain%2FSETUP.md). You can also use the **Deploy** button on the [Herd Manager page](https://github.com/BLTripLaura/herd-manager). Either one opens Vercel.
2. Sign up or sign in with **GitHub**.
3. Vercel asks for a repository name. Keep the suggested one, or type something like `my-herd`.
4. Vercel asks for three settings. Paste in the values from Step 1:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
5. Click **Deploy** and wait a few minutes until it says it's done.
6. Click the preview picture or **Continue to Dashboard**, then **Visit**. Your app's address is something like `my-herd.vercel.app`. Bookmark it.

## Step 3: Set up your herd
1. Open your app's address. You'll see **Set up your herd app**.
2. Enter your farm name, your name, your email and a password, then tap **Set up my herd**.
3. **Do this right after deploying.** The first person to open a new copy becomes its owner.

## After setup
- **Add helpers:** open the menu, then **Import & export**, then **Who can sign in**. Use an email for a person, or just a username (like `barn`) for a shared tablet. You'll get a temporary password to give them.
- **Add to a phone's home screen:** on iPhone or iPad, open the app in Safari, tap Share, then **Add to Home Screen**.
- **Check the Medicine Cabinet with your vet.** Doses and withdrawal times came from another farm and from cow labels. Goats are extra-label, so confirm each one, then turn on **Dose and withdrawal confirmed with vet**.
- **Backups:** the app saves a nightly copy on its own. You can also download everything as one Excel file from **Import & export**.
- **Registration-paper scanning:** this needs an extra paid AI key, so it's off by default. Everything else works without it.

## If something goes wrong
- **"This copy needs its settings":** in Vercel, open your project, go to **Settings**, then **Environment Variables**, and check all three settings. Then open **Deployments**, click the three dots on the newest one, and click **Redeploy**.
- **"The app couldn't reach its database":** the DATABASE_URL is wrong. Most often, `[YOUR-PASSWORD]` wasn't replaced or the password has a typo. Fix it in Vercel and redeploy.
- **Forgot the owner password:** in Supabase, open **SQL Editor**, paste `select herd.set_login('you@example.com', 'your-new-password');` using your email and a new password of 8 or more characters, and click **Run**.
