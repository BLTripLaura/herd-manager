import type { ReactNode } from "react";
import { Link } from "wouter";
import { CheckCircle2, Laptop, Bookmark, MousePointerClick, Download, FileUp, ListChecks, ShieldCheck, Info, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { EasyKeeperImport, ReaderBookmark, CopyReaderButton, bookmarkletCode } from "@/components/easykeeper-import";
import { useHerdInfo } from "@/components/herd-switcher";
import { useList } from "@/lib/herd";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3" data-testid={`step-ek-${n}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</div>
      <div className="min-w-0 flex-1 space-y-2 pb-1">
        <h3 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h3>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/* Where each EasyKeeper record lands (kept in step with server/easykeeper.ts) */
const MAP: [string, string, string][] = [
  ["Profile & Edit Info", "Goat profile", "Registered name, barn name, sex (wethers too), breed, herdbook, birth date, tattoos (ear or tail, left/right), microchip and where it is, ID tag, eye color, ear type, horns, colors & markings. The private description, scrapie tag, mouth and conception type go in Notes."],
  ["Registration #s", "Reg # and ADGA link", "The primary number becomes the Reg #. The ADGA number is turned into the goat's ADGA Genetics link (genetics.adga.org pedigree page) so the Pedigree link beside the ADGA reg # opens it. Other registries (NDHIA, AGS…) are kept in Notes."],
  ["Genetics → sire, dam, grandparents", "Sire, Dam and Pedigree", "Sire and dam fill in on the profile (linked to the herd goat when that goat came over too). Grandparents not in your herd are saved in the pedigree with their reg numbers."],
  ["Genetics → Progeny", "Progeny tab", "Every kid that came over is linked to its sire and dam, so it appears on the parent's Progeny tab — sold and deceased kids included. Kids EasyKeeper lists that were never in your herd are shown under \"Other progeny recorded in EasyKeeper\"."],
  ["Health → History: Medication, Parasite Control, Vaccination, Supplements", "Treatments tab (treatment history)", "Every treatment with its original date, medicine, dose (mL or mg), route if read, and your EasyKeeper notes. These are history only: medicine stock is not taken out and no new reminders are made. A medicine that matches one in your Medications list is linked, and if the goat is still inside its withdrawal time the milk/meat hold shows."],
  ["Health → History: Weight", "Weights", "Pounds and ounces (or kg) converted to pounds."],
  ["Health → History: Maintenance, Test, Body Condition Score", "Care records", "Hoof work becomes Hoof trim; FAMACHA, body condition, udder checks, fecals, weaning and blood tests keep their result; everything else is kept as Maintenance with the original wording."],
  ["Health → Scheduled Health Events", "Reminders on Today", "Open reminders come over with their due date, dose and how often they repeat (every 1 day, every 6 days…). \"Re-evaluate\" is kept. Reminders for sold or deceased goats are left behind."],
  ["Breeding", "Breeding records and heats", "Service/exposure and the kidding that followed are joined into one record with the buck, method, due date, kidding date and number of kids. A kidding with no service date gets its breeding date from the gestation length. False pregnancies and unsuccessful breedings come over as Open. Bucks that came over are linked."],
  ["Notes", "Notes tab", "Each note with its original date and initials. Long notes come over in full."],
  ["Status", "Status, buyer and history", "Owned/boarded/leased stay active; Sold and Culled become Sold with date, buyer and price; Deceased, Stillborn and Harvested become Deceased with the cause. Every status change is also saved as a dated note."],
  ["Photos", "Photos", "Copied into Herd Manager (not just linked), with their captions and dates. The first photo becomes the profile picture."],
  ["Milk (lactations) and Harvest", "Lactations and notes", "Freshening and dry-off dates become lactations; harvest details are saved as a note."],
];

export default function StartPage() {
  const { toast } = useToast();
  const { data: herd } = useHerdInfo();
  const { data: animals } = useList<any>("animals");
  const goats = animals?.length ?? 0;
  return (
    <>
      <PageHeader title="Getting started" sub="Set up your herd app and bring over your goats and their complete records." />
      <div className="space-y-6">
        <section className="rounded-lg border bg-card p-4" data-testid="card-start-checklist">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><ListChecks className="h-4 w-4 text-primary" />First things to do</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /><span>Put in your farm name and add logins for anyone who helps — <Link href="/data" className="font-medium text-primary underline">Import &amp; export</Link>.</span></li>
            <li className="flex gap-2"><CheckCircle2 className={`h-4 w-4 shrink-0 ${herd?.active === "demo" ? "text-amber-600" : "text-primary"}`} /><span>{herd?.active === "demo" ? <b>You're looking at the demo herd. Switch to your own herd before importing.</b> : "You're on your own herd (not the demo)."}</span></li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /><span>Look through <Link href="/meds" className="font-medium text-primary underline">Medications</Link>. Medicines named the same as in EasyKeeper get linked to your treatment history (and their withdrawal times are used). You can rename or add medicines first.</span></li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /><span>Bring your goats over — from EasyKeeper below (everything), from a spreadsheet on <Link href="/data" className="font-medium text-primary underline">Import &amp; export</Link>, or one at a time from registration papers. {goats ? `You have ${goats} goats in Herd Manager now.` : ""}</span></li>
          </ul>
        </section>

        <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="card-start-easykeeper">
          <div>
            <h2 className="text-base font-bold">Bring your whole herd over from EasyKeeper</h2>
            <p className="text-sm text-muted-foreground">This copies every goat that was ever in your EasyKeeper herd and all of its records — profile, registrations, ADGA links, sire and dam, pedigree, progeny, the complete treatment history, care records, weights, reminders, breeding and kidding, notes, status and photos. EasyKeeper has no export button, so a small reader runs in your own signed-in EasyKeeper tab and saves everything to one file. Nothing in EasyKeeper is changed.</p>
          </div>
          <ol className="space-y-4">
            <Step n={1} icon={<Laptop className="h-4 w-4 text-primary" />} title="Use a computer">
              <p>Chrome, Edge or Firefox on Windows or Mac, or Safari on a Mac. This part doesn't work on a phone or iPad. Plug the computer in and keep it from going to sleep — a big herd takes a while.</p>
            </Step>
            <Step n={2} icon={<Bookmark className="h-4 w-4 text-primary" />} title="Add the reader to your bookmarks bar">
              <p>Show the bookmarks bar (<b>Ctrl+Shift+B</b> on Windows, <b>⌘+Shift+B</b> on a Mac), then drag this button up onto it:</p>
              <div className="flex flex-wrap items-center gap-2"><ReaderBookmark /></div>
              <p>Safari, or if dragging doesn't work: bookmark any page, edit that bookmark, and replace its address with the bookmark code.</p>
              <Button variant="outline" size="sm" data-testid="button-ek-copy-bookmark" onClick={async () => { await navigator.clipboard.writeText(bookmarkletCode()); toast({ title: "Bookmark code copied", description: "Paste it as the address (URL) of a bookmark." }); }}>Copy the bookmark code</Button>
            </Step>
            <Step n={3} icon={<MousePointerClick className="h-4 w-4 text-primary" />} title="Open EasyKeeper and click the bookmark">
              <p>Go to <a href="https://app.easykeeper.com" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">app.easykeeper.com</a>, sign in, then click <b>EasyKeeper → Herd Manager</b> in your bookmarks bar. A green box appears in the corner of the EasyKeeper page.</p>
              <p>Click <b>Start reading</b>. It opens each goat's Profile, Genetics, Health, Breeding, Notes, Status, Photos, Milk and Harvest pages in turn. Tick <b>“Also read how each treatment was given”</b> first if you want SQ/IM/oral on every treatment — it opens every single treatment, so it takes several times longer.</p>
              <p>EasyKeeper only allows pages to open slowly, so plan on roughly 10–15 seconds per goat (about an hour for 300 goats). If EasyKeeper asks it to slow down, it waits and carries on by itself. Keep the tab open; you can use other tabs meanwhile.</p>
              <p>If it stops (the computer slept, you were signed out, the tab closed), just sign in again and click the bookmark — it remembers what it already read and continues.</p>
            </Step>
            <Step n={4} icon={<Download className="h-4 w-4 text-primary" />} title="Save the file">
              <p>When the last goat is read, it saves <b>easykeeper-herd-(date).json</b> to your Downloads folder. (You can also click <b>Save file</b> part-way through, import what's there, and import the rest later.) This file holds all your herd records — keep it private.</p>
            </Step>
            <Step n={5} icon={<FileUp className="h-4 w-4 text-primary" />} title="Upload it here">
              <p>Choose the file below, check the totals, and click <b>Bring everything into Herd Manager</b>. Goats go in a few at a time, then the photos are copied. Keep this page open until it says it's finished, then download the import report.</p>
            </Step>
          </ol>
          <EasyKeeperImport />
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">The bookmark won't run? Use the Console instead</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>On your signed-in EasyKeeper tab press <b>F12</b> (Mac: <b>⌘+Option+J</b> in Chrome, <b>⌘+Option+C</b> in Safari) and pick the <b>Console</b> tab.</li>
              <li>Click the button below, click in the Console, paste (<b>Ctrl+V</b> / <b>⌘+V</b>) and press <b>Enter</b>. If Chrome asks, type <b>allow pasting</b> first.</li>
              <li>The same green box appears — carry on from step 3.</li>
            </ol>
            <div className="mt-2"><CopyReaderButton /></div>
          </details>
          <Step n={6} icon={<ShieldCheck className="h-4 w-4 text-primary" />} title="Check a few goats">
            <p>Open a doe you know well: Profile (reg #, tattoos, the <b>Pedigree</b> link to the ADGA record), <b>Progeny</b> tab, <b>Treatments</b>, <b>Care</b>, <b>Breeding</b>, <b>Notes</b> and Photos. Look at <Link href="/" className="font-medium text-primary underline">Today</Link> for the reminders that came over. Keep your EasyKeeper subscription until you're happy everything is here.</p>
          </Step>
        </section>

        <section className="rounded-lg border bg-card p-4" data-testid="card-start-map">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><ArrowRight className="h-4 w-4 text-primary" />What comes over, and where it goes</h2>
          <p className="mb-3 text-sm text-muted-foreground">Every goat EasyKeeper lists under <b>Reports → All animals ever associated with my herd</b>, with these records:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 pr-3">In EasyKeeper</th><th className="py-2 pr-3">In Herd Manager</th><th className="py-2">How</th></tr></thead>
              <tbody>
                {MAP.map(([a, b, c]) => (
                  <tr key={a} className="border-b align-top last:border-0"><td className="py-2 pr-3 font-medium">{a}</td><td className="py-2 pr-3">{b}</td><td className="py-2 text-muted-foreground">{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 text-sm" data-testid="card-start-notes">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Info className="h-4 w-4 text-primary" />Good to know</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Importing the same file again never doubles anything. Every treatment, care record and reminder is matched by its EasyKeeper record number; notes, weights and breedings by date and wording.</li>
            <li>Goats you already typed in are matched by EasyKeeper number, reg #, microchip, or name and birth date. Only empty fields are filled in unless you tick “replace their details”.</li>
            <li>Goats boarded or leased in come over as active with the owner's name in Notes; you can mark them sold or delete them afterwards.</li>
            <li>Anything that can't be brought over is listed in the import report rather than skipped silently.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
