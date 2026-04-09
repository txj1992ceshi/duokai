import { Button, Card, CardContent, CardDescription, CardTitle } from '@duokai/ui'

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card className="overflow-hidden border-dashed">
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.10),transparent_45%)] text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-slate-100 text-3xl text-slate-400">
          +
        </div>
        <div className="space-y-2">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="max-w-md">{description}</CardDescription>
        </div>
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
