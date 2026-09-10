import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; label: string; resetKey?: string }
type State = { error: Error | null }

/**
 * Keeps one broken surface from taking down the whole app: a render error in
 * a tab (e.g. unexpected server data) shows a recoverable message inside that
 * surface instead of unmounting the React tree to a black screen.
 */
export class SurfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[hermes-mobile] ${this.props.label} crashed:`, error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="management-sheet" role="alert">
          <header className="management-head">
            <b>{this.props.label}</b>
          </header>
          <section style={{ padding: '18px 2px' }}>
            <div className="management-error">
              <b>This panel hit a snag.</b>
              <p style={{ margin: '6px 0 0' }}>{this.state.error.message || 'Unexpected data from Hermes.'}</p>
            </div>
            <button className="capability-save" onClick={() => this.setState({ error: null })}>Try again</button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
