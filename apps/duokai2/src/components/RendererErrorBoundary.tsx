import { Component, type ErrorInfo, type ReactNode } from 'react'

type RendererErrorBoundaryProps = {
  children: ReactNode
}

type RendererErrorBoundaryState = {
  failed: boolean
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(520px, 100%)',
            padding: 32,
            border: '1px solid #dbe4f0',
            borderRadius: 20,
            background: '#ffffff',
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24 }}>界面加载失败</h1>
          <p style={{ margin: '12px 0 24px', lineHeight: 1.6, color: '#475569' }}>
            桌面界面遇到了意外错误。请重新加载；如果问题持续，请安装最新版本。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 12,
              background: '#2563eb',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </section>
      </main>
    )
  }
}
