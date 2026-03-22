import type { SettingsPayload } from '../../src/shared/types'

import {
  prepareRuntimeHost,
  releaseRuntimeHost,
  type RuntimeHostDescriptor,
} from './runtimeIsolation'

export interface RuntimeEnvironmentHandle extends RuntimeHostDescriptor {
  status: 'ready' | 'stopped'
}

export class ContainerManager {
  private readonly environments = new Map<string, RuntimeEnvironmentHandle>()

  async startEnvironment(
    profileId: string,
    userDataDir: string,
    settings: SettingsPayload,
  ): Promise<RuntimeEnvironmentHandle> {
    const prepared = await prepareRuntimeHost({
      profileId,
      userDataDir,
      settings,
    })
    const handle: RuntimeEnvironmentHandle = {
      ...prepared,
      status: 'ready',
    }
    this.environments.set(profileId, handle)
    return handle
  }

  async stopEnvironment(profileId: string): Promise<void> {
    const environment = this.environments.get(profileId)
    if (environment) {
      this.environments.set(profileId, { ...environment, status: 'stopped' })
      this.environments.delete(profileId)
    }
    await releaseRuntimeHost()
  }

  getEnvironment(profileId: string): RuntimeEnvironmentHandle | null {
    return this.environments.get(profileId) ?? null
  }

  listEnvironments(): RuntimeEnvironmentHandle[] {
    return [...this.environments.values()]
  }
}
