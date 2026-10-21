import { Component, type ReactNode } from 'react';
import { RouteErrorView } from './RouteErrorPage';

interface PageErrorBoundaryProps {
  resetKey: string;
  showHome: boolean;
  children: ReactNode;
}

interface PageErrorBoundaryState {
  error: unknown;
  failed: boolean;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
    return { error, failed: true };
  }

  componentDidUpdate(prev: PageErrorBoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { error } = this.state;
    return (
      <RouteErrorView
        embedded
        detail={import.meta.env.DEV && error instanceof Error ? error.message : ''}
        showHome={this.props.showHome}
        onReload={() => window.location.reload()}
      />
    );
  }
}
