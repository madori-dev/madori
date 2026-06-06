'use client'

import { useEffect, useState } from 'react'
import { useCPTheme } from '@/components/cp/CPThemeProvider'
import { toast } from 'sonner'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/cp/PageHeader'
import { ErrorAlert } from '@/components/cp/ErrorAlert'
import { ListSkeleton } from '@/components/cp/ListSkeleton'

interface UserProfile {
  id: string
  email: string
  name: string
  roles: string[]
  theme: 'light' | 'dark'
  createdAt: string
  lastLogin?: string
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function UserSettingsPage() {
  const { setTheme, theme: currentTheme } = useCPTheme()

  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Profile form state
  const [profileForm, setProfileForm] = useState({ name: '', email: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    try {
      setLoading(true)
      const res = await fetch('/api/users/me')
      if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`)
      const json = await res.json()
      const data = json.data as UserProfile
      setUser(data)
      setProfileForm({ name: data.name, email: data.email })
      // Sync theme from user profile
      if (data.theme) {
        setTheme(data.theme)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  function handleProfileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setProfileForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'email') {
      setEmailError(null)
    }
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side email validation
    if (!isValidEmail(profileForm.email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    setProfileSaving(true)
    setEmailError(null)

    try {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileForm.name,
          email: profileForm.email,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to update profile: ${res.status}`)
      }

      setUser((prev) => prev ? { ...prev, name: profileForm.name, email: profileForm.email } : prev)
      toast.success('Profile updated successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile'
      toast.error(message)
    } finally {
      setProfileSaving(false)
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setPasswordForm((prev) => ({ ...prev, [name]: value }))
    setPasswordError(null)
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (passwordForm.newPassword.length < 1) {
      setPasswordError('New password is required')
      return
    }

    setPasswordSaving(true)

    try {
      const res = await fetch(`/api/users/${user!.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error?.message || `Failed to change password: ${res.status}`)
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password changed successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(message)
      toast.error(message)
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleThemeToggle() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'

    // Apply immediately via next-themes (updates data-theme on <html>)
    setTheme(newTheme)

    // Persist to backend
    try {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme }),
      })

      if (!res.ok) {
        throw new Error('Failed to save theme preference')
      }

      setUser((prev) => prev ? { ...prev, theme: newTheme } : prev)
      toast.success(`Switched to ${newTheme} mode`)
    } catch {
      // Revert on failure
      setTheme(currentTheme === 'dark' ? 'dark' : 'light')
      toast.error('Failed to save theme preference')
    }
  }

  if (loading) return <ListSkeleton rows={4} />
  if (error && !user) return <ErrorAlert message={error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Settings"
        description="Manage your profile, password, and preferences"
      />

      {/* Profile Section */}
      <Card className="max-w-lg">
        <CardContent>
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                value={profileForm.name}
                onChange={handleProfileChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={profileForm.email}
                onChange={handleProfileChange}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && (
                <p id="email-error" className="text-sm text-destructive">
                  {emailError}
                </p>
              )}
            </div>

            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card className="max-w-lg">
        <CardContent>
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
              />
            </div>

            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}

            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? 'Changing…' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Theme Section */}
      <Card className="max-w-lg">
        <CardContent>
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-sm text-muted-foreground">
                Switch between light and dark mode
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleThemeToggle}
              className="gap-2"
            >
              {currentTheme === 'dark' ? (
                <>
                  <Sun className="size-4" />
                  Light Mode
                </>
              ) : (
                <>
                  <Moon className="size-4" />
                  Dark Mode
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
