import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Unhandled UI error', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="min-h-[60vh] rounded-2xl border border-red-400/20 bg-red-950/20 p-6 text-cream-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200/70">Something went wrong</p>
          <h1 className="mt-3 font-display text-2xl">We could not render this view safely.</h1>
          <p className="mt-2 max-w-prose text-sm text-cream-200/70">
            Refresh the page or return home. The failure was contained so your session and data remain protected.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mt-6 min-h-12 rounded-xl border border-cream-200/20 px-5 text-sm font-semibold text-cream-200 transition hover:bg-cream-200/10 focus:outline-none focus:ring-2 focus:ring-cream-200/60"
          >
            Return home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
