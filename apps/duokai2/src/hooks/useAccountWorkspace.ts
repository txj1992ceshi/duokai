import { useEffect, useState } from 'react'
import type { AuthUser } from '../shared/types'

export type AccountProfileFormState = {
  name: string
  email: string
  username: string
  avatarUrl: string
  bio: string
}

export type AccountPasswordFormState = {
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}

export function emptyAccountProfileForm(user: AuthUser | null): AccountProfileFormState {
  return {
    name: user?.name || '',
    email: user?.email || '',
    username: user?.username || '',
    avatarUrl: user?.avatarUrl || '',
    bio: user?.bio || '',
  }
}

export function emptyAccountPasswordForm(): AccountPasswordFormState {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  }
}

export function useAccountWorkspace({
  currentAuthUser,
}: {
  currentAuthUser: AuthUser | null
}) {
  const [accountProfileForm, setAccountProfileForm] = useState<AccountProfileFormState>(
    emptyAccountProfileForm(currentAuthUser),
  )
  const [accountPasswordForm, setAccountPasswordForm] = useState<AccountPasswordFormState>(
    emptyAccountPasswordForm(),
  )

  useEffect(() => {
    setAccountProfileForm(emptyAccountProfileForm(currentAuthUser))
  }, [currentAuthUser])

  function resetAccountPasswordForm() {
    setAccountPasswordForm(emptyAccountPasswordForm())
  }

  return {
    accountProfileForm,
    setAccountProfileForm,
    accountPasswordForm,
    setAccountPasswordForm,
    resetAccountPasswordForm,
  }
}
