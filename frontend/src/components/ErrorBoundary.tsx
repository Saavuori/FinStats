import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Keeps a failing view from taking the whole app down with it: the error is
 * shown in place of the view, and the rest of the page (dimensions, tabs,
 * the other views) keeps working. Remount it with a new `key` to retry.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-row" role="alert">
          This view failed to render ({this.state.error.message}). Try another view or selection.
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
