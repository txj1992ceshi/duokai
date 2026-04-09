import type { FormEventHandler } from 'react'

export function DesktopAuthView({
  authReady,
  errorMessage,
  authIdentifier,
  authPassword,
  authSubmitting,
  onAuthIdentifierChange,
  onAuthPasswordChange,
  onSubmit,
}: {
  authReady: boolean
  errorMessage: string
  authIdentifier: string
  authPassword: string
  authSubmitting: boolean
  onAuthIdentifierChange: (value: string) => void
  onAuthPasswordChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}) {
  if (!authReady) {
    return <div className="auth-shell">正在初始化桌面端...</div>
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-badge">Duokai</div>
        <h1>登录工作台</h1>
        <p>登录后将与控制台共享同一套云端环境数据。</p>
        {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            <span>账号</span>
            <input
              value={authIdentifier}
              onChange={(event) => onAuthIdentifierChange(event.target.value)}
              placeholder="请输入邮箱或账号"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={authPassword}
              onChange={(event) => onAuthPasswordChange(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          <button type="submit" className="primary auth-submit" disabled={authSubmitting}>
            {authSubmitting ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
