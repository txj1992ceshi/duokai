import { apiFetch } from '@/lib/api-client';

type GetProfileStorageStateOptions = {
  includeContent?: boolean;
};

export async function getProfileStorageState(
  profileId: string,
  options: GetProfileStorageStateOptions = {}
) {
  const params = new URLSearchParams();
  if (options.includeContent) {
    params.set('includeContent', '1');
  }
  const query = params.toString();
  const res = await apiFetch(
    `/api/profile-storage-state/${profileId}${query ? `?${query}` : ''}`
  );
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch storage state');
  }

  return data.storageState || null;
}

export async function saveProfileStorageState(
  profileId: string,
  stateJson: unknown,
  encrypted = false
) {
  const res = await apiFetch(`/api/profile-storage-state/${profileId}`, {
    method: 'PUT',
    body: JSON.stringify({
      stateJson,
      encrypted,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save storage state');
  }

  return data.storageState;
}
