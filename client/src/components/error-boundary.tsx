import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** If a screen hits an unexpected error, show a way back instead of a blank page. Saved records are not affected. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Screen error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6 text-center" role="alert" data-testid="error-screen">
        <h1 className="text-xl font-bold">Something went wrong on this screen</h1>
        <p className="mt-2 text-sm text-muted-foreground">What you saved is safe. Reload to pick up where you left off.</p>
        <p className="mt-3 break-words rounded bg-secondary px-3 py-2 text-left font-mono text-xs text-muted-foreground">{String(this.state.error.message || this.state.error)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => { this.setState({ error: null }); window.location.hash = "#/"; }} data-testid="button-error-home">Go to Today</Button>
          <Button onClick={() => window.location.reload()} data-testid="button-error-reload">Reload</Button>
        </div>
      </div>
    );
  }
}
