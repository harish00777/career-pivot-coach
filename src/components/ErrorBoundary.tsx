import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected display error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#12100F] text-[#EAE4DC] flex items-center justify-center p-6">
          <div className="max-w-lg w-full arch-panel p-8 space-y-4">
            <h1 className="font-editorial text-3xl font-light text-[#EAE4DC]">
              View recovery needed
            </h1>
            <p className="text-sm text-[#A69A8C] leading-relaxed">
              RolexIQ encountered an unexpected display error. Your saved career progress and
              records remain safe.
            </p>
            <pre className="text-xs font-mono-tabular bg-[#12100F] border border-[#382920] p-3 overflow-auto max-h-40 text-[#B86D37]">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="arch-btn-primary px-5 py-2.5"
            >
              Reload view
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
