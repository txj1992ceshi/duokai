import type { Metadata } from 'next'
import '@duokai/ui/styles.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Duokai Web Console',
  description: 'Duokai matrix console for local-runtime environment orchestration.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
