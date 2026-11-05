/** Ownership notice shown on every screen (sign-in, setup and the bottom of every page). */
export const COPYRIGHT_TEXT =
  "This app was developed by Laura Ritter All Rights Reserved. Distribution or copying of any or all of the product is strictly prohibited.";

export function Copyright({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] leading-snug text-muted-foreground ${className}`} data-testid="text-copyright">
      © {new Date().getFullYear()} {COPYRIGHT_TEXT}
    </p>
  );
}
