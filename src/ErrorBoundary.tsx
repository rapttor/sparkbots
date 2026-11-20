import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shows what went wrong instead of a blank screen, with a way to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.label}]`, error, info.componentStack); }
  reset = () => this.setState({ error: null });
  forget = () => {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith("ao.") || k.startsWith("agent-office.")) localStorage.removeItem(k); } catch { /* ignore */ }
    location.reload();
  };
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <section className="panel" role="alert">
        <h2>Something went wrong in {this.props.label}</h2>
        <p className="small" style={{ color: "#e5484d" }}>{e.message}</p>
        <pre className="small mono" style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>{(e.stack ?? "").split("\n").slice(0, 8).join("\n")}</pre>
        <p><button onClick={this.reset}>Try again</button>{" "}
          <button onClick={this.forget} title="Clears the view settings saved in this browser (zoom lock, minimap, filters, ...) and reloads">Reset saved view settings</button></p>
      </section>
    );
  }
}
