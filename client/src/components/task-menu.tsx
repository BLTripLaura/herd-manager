import { useEffect, useState } from "react";
import { MoreVertical, Pencil, Trash2, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Field } from "@/components/forms";
import { ConfirmDelete } from "@/components/confirm-delete";
import { useSave, useRemove, fmtShort, everyText, type Task } from "@/lib/herd";

/** Edit, stop repeating, or delete a to-do (hoof trims, wellness checks, imported reminders…) */
export function TaskMenu({ task }: { task: Task }) {
  const save = useSave("tasks");
  const remove = useRemove("tasks");
  const { toast } = useToast();
  const [mode, setMode] = useState<null | "edit" | "stop" | "delete">(null);
  const [v, setV] = useState<any>({});
  useEffect(() => { if (mode === "edit") setV({ title: task.title, dueDate: task.dueDate, repeatEvery: task.repeatEvery ?? "", notes: task.notes ?? "" }); }, [mode]); // eslint-disable-line
  const set = (k: string) => (x: any) => setV((p: any) => ({ ...p, [k]: x }));
  const saveEdit = async () => {
    if (!String(v.title).trim() || !v.dueDate) return toast({ title: "Enter a name and due date", variant: "destructive" });
    const every = Number(v.repeatEvery);
    await save.mutateAsync({ id: task.id, title: String(v.title).trim(), dueDate: v.dueDate, repeatEvery: every > 0 ? every : null, notes: String(v.notes).trim() || null } as any);
    toast({ title: "To-do changed" }); setMode(null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="More to-do options" data-testid={`button-task-more-${task.id}`}><MoreVertical className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("edit")} data-testid={`menu-edit-task-${task.id}`}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
          {!!task.repeatEvery && <DropdownMenuItem onSelect={() => setMode("stop")} data-testid={`menu-stop-task-${task.id}`}><Repeat2 className="mr-2 h-4 w-4" />Stop repeating</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setMode("delete")} className="text-destructive focus:text-destructive" data-testid={`menu-delete-task-${task.id}`}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode === "edit"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit to-do</DialogTitle><DialogDescription>Changes are noted in the system log.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="What to do" className="col-span-2"><Input value={v.title ?? ""} onChange={(e) => set("title")(e.target.value)} data-testid="input-task-title" /></Field>
            <Field label="Due"><Input type="date" value={v.dueDate ?? ""} onChange={(e) => set("dueDate")(e.target.value)} data-testid="input-task-date" /></Field>
            <Field label="Repeat every (days)" hint="Blank = once"><Input type="number" inputMode="numeric" min={1} value={v.repeatEvery ?? ""} onChange={(e) => set("repeatEvery")(e.target.value)} data-testid="input-task-every" /></Field>
            <Field label="Notes" className="col-span-2"><Input value={v.notes ?? ""} onChange={(e) => set("notes")(e.target.value)} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button onClick={saveEdit} disabled={save.isPending} data-testid="button-save-task">Save changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={mode === "stop"} onOpenChange={(o) => !o && setMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop repeating “{task.title}”?</AlertDialogTitle>
            <AlertDialogDescription>It comes off the list ({everyText(task.repeatEvery).toLowerCase()}, next {fmtShort(task.dueDate)}) and no new one is added.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await save.mutateAsync({ id: task.id, done: true, stopRepeat: true } as any); toast({ title: "Stopped", description: task.title }); }} data-testid="button-confirm-stop-task">Stop repeating</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDelete open={mode === "delete"} onOpenChange={(o) => !o && setMode(null)} testId="button-confirm-delete-task"
        title={`Delete “${task.title}”?`} body={`Removes this to-do (due ${fmtShort(task.dueDate)})${task.repeatEvery ? " and it won't repeat" : ""}. This can't be undone and is noted in the system log.`}
        onConfirm={async () => { await remove.mutateAsync(task.id); setMode(null); }} />
    </>
  );
}
