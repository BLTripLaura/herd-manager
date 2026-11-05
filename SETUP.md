# Herd Manager: set up your own copy

> © 2026 Laura Ritter. This app was developed by Laura Ritter All Rights Reserved. Distribution or copying of any or all of the product is strictly prohibited.

This gives you your own private goat herd app. Your records live in your own free accounts. Nobody else, including the person who shared it, can see them.

Your copy comes with:
- **A stocked Medicine Cabinet:** 44 common goat medicines with doses, routes, repeat schedules and withdrawal notes. Stock starts at zero, and every medicine is marked "not yet confirmed with vet".
- **Three ways to bring your goats in:** your whole herd from EasyKeeper (every goat with its complete records), a spreadsheet, or a photo of each goat's registration papers.
- **Automatic backups:** every night, with weekly and monthly copies kept.
- **Your own logins:** you'll be the owner, and you can add helpers or a shared barn tablet login.

Setup takes about 20 minutes and costs nothing on the free plans.

## What you need
- An email address
- A **GitHub** account (free, [github.com](https://github.com/signup)). Vercel keeps your copy of the app there.
- A computer for setup and the EasyKeeper import. After that, the app works on phones and tablets.

## Step 1: Make your database (Supabase)
1. Go to [supabase.com](https://supabase.com) and sign up (the free plan is fine).
2. Click **New project**. Pick any name (for example "herd"), make up a **database password**, and **write it down**. Choose the region closest to you, then click **Create new project**. Wait a minute or two while it starts.
3. Click the **Connect** button at the top of the project page. Under **Session pooler**, copy the connection string. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
   Paste it into a note and replace `[YOUR-PASSWORD]` (including the square brackets) with your database password from step 2. This is your **DATABASE_URL**.
4. Go to **Project Settings**, then **Data API** (or **API**), and copy the **Project URL** (it looks like `https://abcdefgh.supabase.co`). This is your **SUPABASE_URL**.
5. Go to **Project Settings**, then **API Keys**, and copy the **Publishable key** (it starts with `sb_publishable_`). This is your **SUPABASE_PUBLISHABLE_KEY**.

You don't need to build any tables. The app does that itself the first time it opens.

## Step 2: Put the app online (Vercel)
1. Open the **install link**: [Deploy Herd Manager to Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBLTripLaura%2Fherd-manager&project-name=my-herd&repository-name=my-herd&env=DATABASE_URL%2CSUPABASE_URL%2CSUPABASE_PUBLISHABLE_KEY&envDescription=Three+values+from+your+free+Supabase+project.+The+setup+guide+shows+where+to+find+each+one.&envLink=https%3A%2F%2Fgithub.com%2FBLTripLaura%2Fherd-manager%2Fblob%2Fmain%2FSETUP.md). You can also use the **Deploy** button on the [Herd Manager page](https://github.com/BLTripLaura/herd-manager).
2. Sign up or sign in with **GitHub**.
3. Vercel asks for a repository name. Keep the suggested one, or type something like `my-herd`.
4. Vercel asks for three settings. Paste in the values from Step 1:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
5. Click **Deploy** and wait a few minutes until it says it's done.
6. Click **Continue to Dashboard**, then **Visit**. Your app's address is something like `my-herd.vercel.app`. Bookmark it.

## Step 3: Claim your herd app
1. Open your app's address. You'll see **Set up your herd app**.
2. Enter your farm name, your name, your email and a password, then tap **Set up my herd**.
3. **Do this right after deploying.** The first person to open a new copy becomes its owner.
4. The app opens on **Getting started**. It has everything below, with the buttons you need. You can always get back to it from the menu.

## Step 4: Bring your goats in
Use any mix of these. Bringing the same goat in twice updates it instead of making a second copy.

### A. Your whole herd from EasyKeeper
EasyKeeper has no export button, so Herd Manager gives you a small reader that runs in your own signed-in EasyKeeper tab. It only reads; nothing in EasyKeeper changes.

1. On a computer (Chrome, Edge, Firefox, or Safari on a Mac), open your Herd Manager and go to **Getting started**.
2. Show your bookmarks bar (Ctrl+Shift+B on Windows, ⌘+Shift+B on a Mac) and drag the **EasyKeeper → Herd Manager** button onto it. (Safari: use **Copy the bookmark code**, make a bookmark, and paste the code as its address.)
3. Open [app.easykeeper.com](https://app.easykeeper.com), sign in, and click that bookmark. A green box appears. Click **Start reading**.
   - It goes slowly so EasyKeeper doesn't block it: about 10–15 seconds per goat (about an hour for 300 goats). Keep the computer awake and the tab open; you can use other tabs.
   - If it stops, sign in again and click the bookmark. It continues where it left off.
   - Optional: tick **Also read how each treatment was given** to bring over SQ/IM/oral for every treatment. It takes several times longer.
4. When it finishes it saves **easykeeper-herd-(date).json** to your Downloads. This file holds all your records, so keep it private.
5. Back on **Getting started**, choose the file and click **Bring everything into Herd Manager**. Keep the page open until it says it's finished, then download the import report.

What comes over: every goat ever in your EasyKeeper herd (active, sold, deceased) with its profile, registration numbers, **ADGA pedigree link**, sire, dam and grandparents, **progeny**, **complete treatment history** (medication, parasite control, vaccinations, supplements), care records (hoof trims, FAMACHA, body condition and more), weights, open reminders, breeding and kidding, notes, status history with buyer and cause of death, photos, lactations and harvest notes. Treatment history doesn't take anything out of your Medicine Cabinet stock.

### B. A spreadsheet
Save your sheet as **.xlsx** or **.csv**, one goat per row, with column headings in the first row. In the app go to **Import & export → Import goats from a spreadsheet**, choose the file, check how each column was matched, and import. A ready-made template is there too.

Suggested column headings (only **Name** is required; leave out any you don't use):

| Column | What to put in it |
|---|---|
| Name | Registered name (required) |
| Barn name | Everyday name |
| Tag | Herd or ear tag number |
| Reg # | Registration number, for example PB1652357 |
| Sex | Doe, Buck or Wether |
| Date of birth | 3/12/2025 or 2025-03-12 |
| Breed | For example Oberhasli |
| Herdbook | Purebred, American, Experimental, Recorded Grade |
| Ear type | Erect, Elf, Gopher… |
| Color | Color and markings |
| Eye color | |
| Horn status | Disbudded, Horned, Polled or Scurs |
| Tattoo location | Ear or Tail |
| Tattoo right | Right ear tattoo |
| Tattoo left | Left ear tattoo |
| Microchip location | |
| Microchip | Chip number |
| Pasture | Pasture or pen name |
| Sire | Father's name (linked if he's in the sheet or app) |
| Dam | Mother's name (linked if she's in the sheet or app) |
| In milk | Yes or No |
| Status | Active, Sold or Deceased (blank = Active) |
| Pedigree link | ADGA Genetics web address (optional; made from an ADGA Reg # if left blank) |
| Notes | Anything else |

Similar headings (like "Registration number" or "DOB") are usually recognized, and you can match any column by hand. A spreadsheet brings in the goats themselves; treatment history and notes come with the EasyKeeper import or can be added in the app.

### C. A photo or scan of the registration papers
**Scan registration papers** (on the Herd page, Import & export, and each goat's profile) reads a clear, flat photo or scan of the certificate: name, reg #, breed, birth date, tattoos, sire, dam and grandparents. You check everything, then it saves a new goat (or fills in one already there) and keeps the paper photo on file.

Paper reading uses Anthropic's Claude AI, which charges a few cents per paper, so it's off until you add your own key (one time):
1. Go to [console.anthropic.com](https://console.anthropic.com), sign up, and under **Billing** add a card and a small credit (for example $5).
2. Under **API keys**, click **Create key** and copy it (it starts with `sk-ant-`).
3. In [Vercel](https://vercel.com/dashboard), open your herd project → **Settings** → **Environment Variables**. Add `ANTHROPIC_API_KEY` with the key as its value and save.
4. Open **Deployments**, click the three dots (⋯) on the newest one, and click **Redeploy**.

## Step 5: Backups (daily, weekly, monthly)
- **Daily — automatic.** A full copy of every record is saved every night around 2:00 AM Eastern. Nothing to set up.
- **Weekly and monthly — automatic.** The app keeps every nightly copy for 30 days, each Sunday's copy for 12 weeks, and the first copy of each month for a year. See them under **Import & export → Backups**; each downloads as an Excel file.
- **A copy outside the app — monthly, you.** The copies above live in the app's own database, so keep one somewhere else too. Once a month, Today shows **Time to save this month's backup**. Click **Download backup** and save the Excel file to your computer, Google Drive or OneDrive.

### Optional: have the weekly Excel copy sent to you automatically
If you use Perplexity Computer, it can download the backup every week and email it to you or save it to OneDrive or Google Drive, the way Laura's is set up.
1. Make a backup key: a long password of at least 24 letters and numbers, no spaces (a password manager's generator works well). Write it down.
2. In Vercel, open your herd project → **Settings** → **Environment Variables**. Add `BACKUP_TOKEN` with that key as its value, save, then **Redeploy** the newest deployment.
3. In Perplexity Computer, ask:
   > Every Sunday at 7 AM, download my Herd Manager backup from https://YOUR-APP.vercel.app/api/backups/excel using my backup key as a Bearer token. Email the Excel file to me and save it to my OneDrive (or Google Drive) folder "Herd backups", keeping the most recent 8.
   
   Replace YOUR-APP with your app's address. When it asks for the backup key, enter it in the secure form it shows you (not in the chat).
4. The Backups card shows when the weekly copy was last sent.

## After setup
- **Add helpers:** menu → **Import & export** → **Who can sign in**. Use an email for a person, or just a username (like `barn`) for a shared tablet. You'll get a temporary password to give them.
- **Put it on your phone's home screen:** on iPhone or iPad, open the app in Safari, tap Share, then **Add to Home Screen**. On Android, open it in Chrome, tap ⋮, then **Add to Home screen**.
- **Check the Medicine Cabinet with your vet.** Doses and withdrawal times came from another farm and from labels. Goats are often extra-label, so confirm each one, then turn on **Dose and withdrawal confirmed with vet**.
- **Keep your EasyKeeper subscription** until you've checked that everything came over.

## If something goes wrong
- **"This copy needs its settings":** in Vercel, open your project → **Settings** → **Environment Variables**, and check all three settings. Then open **Deployments**, click ⋯ on the newest one, and click **Redeploy**.
- **"The app couldn't reach its database":** the DATABASE_URL is wrong. Most often `[YOUR-PASSWORD]` wasn't replaced or the password has a typo. Fix it in Vercel and redeploy.
- **"Reading papers isn't switched on yet":** add `ANTHROPIC_API_KEY` as in Step 4C and redeploy.
- **The EasyKeeper bookmark does nothing:** use **The bookmark won't run? Use the Console instead** on Getting started.
- **Forgot the owner password:** in Supabase, open **SQL Editor**, paste `select herd.set_login('you@example.com', 'your-new-password');` with your email and a new password of 8 or more characters, and click **Run**.
