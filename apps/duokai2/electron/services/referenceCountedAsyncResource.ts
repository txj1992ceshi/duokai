export interface AsyncResourceLease<Resource> {
  resource: Resource
  release(): Promise<void>
}

export interface AsyncResourcePoolEntry<Resource> {
  key: string
  referenceCount: number
  resource: Resource
}

type ResourceEntry<Resource> = {
  promise: Promise<Resource>
  referenceCount: number
  close(resource: Resource): Promise<void>
}

export class ReferenceCountedAsyncResourcePool<Resource> {
  private readonly entries = new Map<string, ResourceEntry<Resource>>()

  async acquire(
    key: string,
    create: () => Promise<Resource>,
    close: (resource: Resource) => Promise<void>,
  ): Promise<AsyncResourceLease<Resource>> {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) {
      throw new Error('Reference-counted async resource key is required.')
    }

    let entry = this.entries.get(normalizedKey)
    if (!entry) {
      const created: ResourceEntry<Resource> = {
        promise: Promise.resolve().then(create),
        referenceCount: 0,
        close,
      }
      created.promise = created.promise.catch((error) => {
        if (this.entries.get(normalizedKey) === created) {
          this.entries.delete(normalizedKey)
        }
        throw error
      })
      this.entries.set(normalizedKey, created)
      entry = created
    }

    entry.referenceCount += 1
    let resource: Resource
    try {
      resource = await entry.promise
    } catch (error) {
      entry.referenceCount = Math.max(0, entry.referenceCount - 1)
      throw error
    }

    let released = false
    return {
      resource,
      release: async () => {
        if (released) {
          return
        }
        released = true
        entry!.referenceCount = Math.max(0, entry!.referenceCount - 1)
        if (entry!.referenceCount > 0 || this.entries.get(normalizedKey) !== entry) {
          return
        }
        this.entries.delete(normalizedKey)
        await entry!.close(resource)
      },
    }
  }

  async inspect(): Promise<Array<AsyncResourcePoolEntry<Resource>>> {
    const result: Array<AsyncResourcePoolEntry<Resource>> = []
    for (const [key, entry] of this.entries) {
      try {
        result.push({
          key,
          referenceCount: entry.referenceCount,
          resource: await entry.promise,
        })
      } catch {
        // Failed creations remove themselves from the pool and are omitted from diagnostics.
      }
    }
    return result
  }

  async closeAll(): Promise<string[]> {
    const entries = [...this.entries.entries()]
    this.entries.clear()
    const errors: string[] = []
    for (const [key, entry] of entries) {
      try {
        const resource = await entry.promise
        await entry.close(resource)
      } catch (error) {
        errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return errors
  }
}
