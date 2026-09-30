import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportAnimals } from "@/components/import-animals";
import { ScanPapersButton } from "@/components/papers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/shell";
import { post, API_BASE } from "@/lib/herd";
import { queryClient } from "@/lib/queryClient";
import { HerdSwitcher } from "@/components/herd-switcher";
import { BackupsCard } from "@/components/backups-card";
import { LoginsCard, FarmNameCard, useMe } from "@/components/auth";

export default function DataPage() {
  const me = useMe();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<null | "sample" | "clear">(null);

  return (
    <>
      <PageHeader title="Import & export" sub="Bring in your herd from Excel, CSV or Google Sheets, and back up your records." />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" data-testid="card-scan-new">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-sm font-bold">Add a goat from its registration papers</h2>
            <p className="text-sm text-muted-foreground">Take a photo of the certificate. The details and pedigree are read for you to check before saving, and the photo is kept on the profile.</p>
          </div>
          <ScanPapersButton />
        </div>
        <FarmNameCard />
        <LoginsCard />
        <BackupsCard />
        <ImportAnimals />

        <section className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><Download className="h-4 w-4 text-primary" />Export to CSV</h2>
            <p className="mb-3 text-sm text-muted-foreground">Opens in Excel or Google Sheets. Good for backups and your vet.</p>
            <div className="flex flex-wrap gap-2">
              {[["animals", "Animals"], ["treatments", "Treatments"], ["weights", "Weights"], ["breedings", "Breedings"], ["milk", "Milk"], ["medications", "Medications"], ["pastures", "Pastures"], ["pastureMoves", "Pasture moves"], ["outsideBucks", "Tank & guest bucks"], ["shows", "Shows"], ["animalNotes", "Animal notes"]].map(([r, l]) => (
                <Button key={r} asChild variant="outline" size="sm"><a href={`${API_BASE}/api/export/${r}`} target="_blank" rel="noopener noreferrer" data-testid={`link-export-${r}`}><Download />{l}</a></Button>
              ))}
            </div>
          </div>
          {me?.role === "owner" && <HerdSwitcher onErase={() => setConfirm("clear")} onSample={() => setConfirm("sample")} />}
        </section>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "clear" ? "Erase every goat and record in this herd?" : "Refresh the demo herd?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "clear" ? "A spare copy is kept automatically, but export first if you want your own backup." : "This puts the demo back to its saved state with dates moved up to today. Your own herd is not touched."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-data" onClick={async () => {
              if (confirm === "clear") await post("/api/admin/clear");
              else { await post("/api/admin/sample"); }
              queryClient.invalidateQueries();
              toast({ title: confirm === "clear" ? "All records erased" : "Demo herd refreshed" }); setConfirm(null);
            }}>{confirm === "clear" ? "Erase everything" : "Refresh demo"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
