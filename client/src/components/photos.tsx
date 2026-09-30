import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { API_BASE, fmtDate, shortName, today, type Animal, goatName, regName } from "@/lib/herd";

export type Photo = { id: number; animalId: number; date: string; caption: string | null; thumb: string };

const photosKey = (id: number) => [`/api/animals/${id}/photos`];
export function usePhotos(animalId: number) {
  return useQuery<Photo[]>({ queryKey: photosKey(animalId), enabled: !!animalId });
}

/** Small thumbnails for many goats at once (herd list). */
export function useThumbs(ids: number[]) {
  const key = [...ids].sort((a, b) => a - b).join(",");
  return useQuery<Record<string, string>>({
    queryKey: ["photo-thumbs", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetch(`${API_BASE}/api/photo-thumbs?ids=${key}`)).json(),
  });
}

function refresh(animalId: number) {
  queryClient.invalidateQueries({ queryKey: photosKey(animalId) });
  queryClient.invalidateQueries({ queryKey: ["/api/animals"] });
  queryClient.invalidateQueries({ queryKey: ["photo-thumbs"] });
}

/** Shrink a photo in the browser so uploads are fast and storage stays small. */
export async function resize(file: File, max: number, quality: number, square = false): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally { URL.revokeObjectURL(url); }
}

export function useAddPhotos(animal: Animal) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFiles = async (files: FileList | null, makeProfile = false) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (!list.length) return;
    setBusy(list.length);
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        const [full, thumb, mini] = await Promise.all([resize(f, 1600, 0.82), resize(f, 480, 0.78, true), resize(f, 96, 0.7, true)]);
        await apiRequest("POST", `/api/animals/${animal.id}/photos`, { full, thumb, mini, date: today(), makeProfile: makeProfile && i === 0 });
        ok++;
      } catch {
        toast({ title: `Couldn't add ${f.name}`, description: "Try a JPEG or PNG photo.", variant: "destructive" });
      }
      setBusy(list.length - i - 1);
    }
    setBusy(0);
    if (inputRef.current) inputRef.current.value = "";
    refresh(animal.id);
    if (ok) toast({ title: ok === 1 ? "Photo added" : `${ok} photos added`, description: goatName(animal) });
  };
  return { busy, onFiles, inputRef };
}

/** Header snapshot: profile photo, or tag tile with a camera prompt. */
export function ProfilePhoto({ animal, onOpen }: { animal: Animal; onOpen: (photoId: number) => void }) {
  const { data: photos = [] } = usePhotos(animal.id);
  const { busy, onFiles, inputRef } = useAddPhotos(animal);
  const p = photos.find((x) => x.id === animal.photoId) ?? photos[0];
  if (p) {
    return (
      <button onClick={() => onOpen(p.id)} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted sm:h-28 sm:w-28" aria-label="Open photos" data-testid="button-profile-photo">
        <img src={p.thumb} alt={`${animal.name} snapshot`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        {photos.length > 1 && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{photos.length} photos</span>}
      </button>
    );
  }
  return (
    <label className="relative flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 sm:h-28 sm:w-28" data-testid="button-add-profile-photo">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
      <span className="text-center text-[11px] font-semibold leading-tight">{busy ? "Adding…" : <>Add<br />snapshot</>}</span>
      {animal.tag && <span className="absolute left-1.5 top-1 text-[10px] font-bold tabular-nums text-muted-foreground">{animal.tag}</span>}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onFiles(e.target.files, true)} data-testid="input-profile-photo" />
    </label>
  );
}

/** Photos card on the profile: grid of thumbnails, add more, open viewer. */
export function PhotoGallery({ animal, openId, setOpenId }: { animal: Animal; openId: number | null; setOpenId: (id: number | null) => void }) {
  const { data: photos = [], isLoading } = usePhotos(animal.id);
  const { busy, onFiles, inputRef } = useAddPhotos(animal);
  return (
    <div className="rounded-lg border bg-card" data-testid="card-photos">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-bold">Photos{photos.length ? <span className="ml-1.5 font-normal text-muted-foreground">({photos.length})</span> : null}</h2>
        <Button size="sm" variant="outline" asChild>
          <label className="cursor-pointer" data-testid="button-add-photos">
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}{busy ? `Adding ${busy}…` : "Add photos"}
            <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} data-testid="input-add-photos" />
          </label>
        </Button>
      </div>
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : photos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No photos yet. Add a clear side view, face and any markings to help identify this goat.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id}>
              <button onClick={() => setOpenId(p.id)} className="group relative block aspect-square w-full overflow-hidden rounded-md border bg-muted" data-testid={`button-photo-${p.id}`}>
                <img src={p.thumb} alt={p.caption || `Photo from ${fmtDate(p.date)}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                {p.id === animal.photoId && <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"><Star className="h-2.5 w-2.5 fill-current" />Profile</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PhotoViewer animal={animal} photos={photos} openId={openId} setOpenId={setOpenId} />
    </div>
  );
}

function PhotoViewer({ animal, photos, openId, setOpenId }: { animal: Animal; photos: Photo[]; openId: number | null; setOpenId: (id: number | null) => void }) {
  const { toast } = useToast();
  const idx = photos.findIndex((p) => p.id === openId);
  const p = idx >= 0 ? photos[idx] : null;
  const [caption, setCaption] = useState("");
  const [confirm, setConfirm] = useState(false);
  const full = useQuery<{ full: string }>({ queryKey: [`/api/photos/${p?.id}`], enabled: !!p, staleTime: Infinity });
  useEffect(() => setCaption(p?.caption ?? ""), [p?.id]); // eslint-disable-line
  const go = (d: number) => photos.length && setOpenId(photos[(idx + d + photos.length) % photos.length].id);
  useEffect(() => {
    if (!p) return;
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const touch = useRef<number | null>(null);

  const saveCaption = async () => {
    if (!p || caption === (p.caption ?? "")) return;
    await apiRequest("PATCH", `/api/photos/${p.id}`, { caption }); refresh(animal.id);
  };
  const makeProfile = async () => {
    if (!p) return;
    await apiRequest("PATCH", `/api/photos/${p.id}`, { makeProfileFor: animal.id }); refresh(animal.id);
    toast({ title: "Profile photo updated" });
  };
  const remove = async () => {
    if (!p) return;
    const next = photos.length > 1 ? photos[(idx + 1) % photos.length].id : null;
    await apiRequest("DELETE", `/api/photos/${p.id}`); refresh(animal.id);
    setConfirm(false); setOpenId(next); toast({ title: "Photo deleted" });
  };

  return (
    <>
      <Dialog open={!!p} onOpenChange={(o) => { if (!o) { saveCaption(); setOpenId(null); } }}>
        <DialogContent className="max-h-[95dvh] w-[calc(100vw-1rem)] grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto p-3 sm:max-w-3xl sm:p-4">
          <DialogTitle className="pr-8 text-base">{goatName(animal)} <span className="font-normal text-muted-foreground">· {idx + 1} of {photos.length}</span></DialogTitle>
          <DialogDescription className="sr-only">Photo viewer. Use the arrows to see other photos.</DialogDescription>
          <div className="relative flex min-h-[40dvh] items-center justify-center overflow-hidden rounded-md bg-black"
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null; }}>
            <img src={full.data?.full ?? p?.thumb} alt={p?.caption || "Goat photo"} className="max-h-[65dvh] w-auto max-w-full object-contain" data-testid="img-photo-full" />
            {photos.length > 1 && <>
              <div className="absolute left-2 top-1/2 -translate-y-1/2"><Button size="icon" variant="secondary" className="rounded-full opacity-90" onClick={() => go(-1)} aria-label="Previous photo" data-testid="button-photo-prev"><ChevronLeft /></Button></div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2"><Button size="icon" variant="secondary" className="rounded-full opacity-90" onClick={() => go(1)} aria-label="Next photo" data-testid="button-photo-next"><ChevronRight /></Button></div>
            </>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={saveCaption} onKeyDown={(e) => e.key === "Enter" && saveCaption()}
              placeholder="Caption, e.g. right side, white spot on left hind" className="min-w-0 flex-1 basis-60" data-testid="input-photo-caption" />
            <span className="text-xs text-muted-foreground">{p && fmtDate(p.date)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            {p && p.id === animal.photoId
              ? <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Star className="h-4 w-4 fill-primary text-primary" />Profile photo</span>
              : <Button variant="outline" size="sm" onClick={makeProfile} data-testid="button-make-profile"><Star />Use as profile photo</Button>}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm(true)} data-testid="button-delete-photo"><Trash2 />Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this photo?</AlertDialogTitle><AlertDialogDescription>This removes it from {goatName(animal)}'s profile. It can't be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove} data-testid="button-confirm-delete-photo">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
