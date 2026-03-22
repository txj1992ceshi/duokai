export type RuntimeStatus = 'queued' | 'starting' | 'running' | 'idle' | 'stopped' | 'error'

export interface SchedulerDeps {
  getMaxConcurrentStarts: () => number
  getMaxActiveProfiles: () => number
  getLaunchRetries: () => number
  getRunningCount: () => number
  onStart: (profileId: string) => Promise<void>
  onStatusChange: (profileId: string, status: RuntimeStatus) => Promise<void>
  onError: (profileId: string, error: unknown) => Promise<void>
}

export class RuntimeScheduler {
  private readonly launchQueue: string[] = []
  private readonly queuedProfileIds = new Set<string>()
  private readonly startingProfileIds = new Set<string>()
  private readonly cancelledLaunches = new Set<string>()
  private readonly launchRetryCounts = new Map<string, number>()
  private launchQueueActive = false
  private readonly deps: SchedulerDeps

  constructor(deps: SchedulerDeps) {
    this.deps = deps
  }

  enqueue(profileId: string): boolean {
    this.cancelledLaunches.delete(profileId)
    if (this.queuedProfileIds.has(profileId) || this.startingProfileIds.has(profileId)) {
      return false
    }
    this.queuedProfileIds.add(profileId)
    this.launchQueue.push(profileId)
    void this.deps.onStatusChange(profileId, 'queued')
    void this.processQueue()
    return true
  }

  cancel(profileId: string): void {
    this.cancelledLaunches.add(profileId)
    this.queuedProfileIds.delete(profileId)
    this.startingProfileIds.delete(profileId)
    const queuedIndex = this.launchQueue.indexOf(profileId)
    if (queuedIndex >= 0) {
      this.launchQueue.splice(queuedIndex, 1)
    }
  }

  stop(profileId: string): void {
    this.cancel(profileId)
    this.launchRetryCounts.delete(profileId)
    void this.deps.onStatusChange(profileId, 'stopped')
  }

  getQueuedIds(): string[] {
    return [...this.queuedProfileIds]
  }

  getStartingIds(): string[] {
    return [...this.startingProfileIds]
  }

  getRetryCounts(): Record<string, number> {
    return Object.fromEntries(this.launchRetryCounts.entries())
  }

  isCancelled(profileId: string): boolean {
    return this.cancelledLaunches.has(profileId)
  }

  markStopped(profileId: string): void {
    this.launchRetryCounts.delete(profileId)
    this.cancelledLaunches.delete(profileId)
    void this.deps.onStatusChange(profileId, 'stopped')
    void this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.launchQueueActive) {
      return
    }
    this.launchQueueActive = true
    try {
      while (
        this.launchQueue.length > 0 &&
        this.startingProfileIds.size < this.deps.getMaxConcurrentStarts() &&
        this.deps.getRunningCount() + this.startingProfileIds.size < this.deps.getMaxActiveProfiles()
      ) {
        const profileId = this.launchQueue.shift()
        if (!profileId) {
          break
        }
        if (this.cancelledLaunches.has(profileId) || this.startingProfileIds.has(profileId)) {
          continue
        }
        this.queuedProfileIds.delete(profileId)
        this.startingProfileIds.add(profileId)
        void this.runStart(profileId)
      }
    } finally {
      this.launchQueueActive = false
    }
  }

  private async runStart(profileId: string): Promise<void> {
    try {
      await this.deps.onStatusChange(profileId, 'starting')
      await this.deps.onStart(profileId)
      this.launchRetryCounts.delete(profileId)
      await this.deps.onStatusChange(profileId, 'running')
    } catch (error) {
      if (error instanceof Error && error.message === 'Launch cancelled') {
        this.launchRetryCounts.delete(profileId)
        await this.deps.onStatusChange(profileId, 'stopped')
        return
      }

      const retries = (this.launchRetryCounts.get(profileId) ?? 0) + 1
      this.launchRetryCounts.set(profileId, retries)
      if (retries <= this.deps.getLaunchRetries()) {
        this.queuedProfileIds.add(profileId)
        this.launchQueue.push(profileId)
        await this.deps.onStatusChange(profileId, 'queued')
      } else {
        await this.deps.onStatusChange(profileId, 'error')
        await this.deps.onError(profileId, error)
      }
    } finally {
      this.startingProfileIds.delete(profileId)
      setImmediate(() => {
        void this.processQueue()
      })
    }
  }
}
