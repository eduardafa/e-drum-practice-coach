import { Component, type ReactNode } from "react";

/** What the error says, for the details under the message. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Shown instead of the app when it crashes, so a crash is a message rather than a blank page. The error itself is
 * under "Details": on a phone there's no developer console, so this is the only place to read it.
 */
export function CrashScreen({ error }: { error: unknown }) {
  return (
    <main className="crash" role="alert">
      <h1>Something went wrong</h1>
      <p>The app hit a problem and couldn't show this page. Reloading often fixes it. Your saved practice history is safe.</p>
      <button type="button" className="primary" onClick={() => location.reload()}>
        Reload
      </button>
      <details>
        <summary>Details</summary>
        <pre>{describe(error)}</pre>
      </details>
    </main>
  );
}

interface State {
  /** Set once something below has thrown while drawing; `crashed` tells a thrown undefined from no error. */
  crashed: boolean;
  error: unknown;
}

/**
 * Catches an error thrown while drawing the app and shows the crash screen. Without it, React removes the whole
 * page and leaves it blank.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { crashed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): State {
    return { crashed: true, error };
  }

  override render() {
    return this.state.crashed ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
