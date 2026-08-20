import { NextRequest, NextResponse } from 'next/server'
import type { ComposedAuthService } from '@/lib/auth/composer'
import { NotFoundError, ConflictError } from '@/lib/errors'
import { verifyPassword } from '@/lib/auth/password'
import { assertSafeUserId } from '@/lib/auth/providers/yaml'

/**
 * Basic email format validation.
 * Checks for non-empty local part, @ symbol, and non-empty domain with a dot.
 */
export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidUserId(id: unknown): id is string {
  try {
    assertSafeUserId(id as string)
    return true
  } catch {
    return false
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidRoleHandle(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

export type RoleExists = (handle: string) => Promise<boolean>

/**
 * User handlers that operate via ComposedAuthService for all user CRUD.
 */
export function createUserHandlers(
  authService: ComposedAuthService,
  roleExists: RoleExists = async () => false
) {
  async function handleListUsers(): Promise<NextResponse> {
    const users = await authService.listUsers()
    // Strip password hashes from response
    const safeUsers = users.map(({ id, email, name, roles, createdAt, lastLogin }) => ({
      id,
      email,
      name,
      roles,
      createdAt,
      lastLogin,
    }))
    return NextResponse.json({ data: safeUsers })
  }

  async function handleGetUser(
    _request: NextRequest,
    userId: string
  ): Promise<NextResponse> {
    try {
      const user = await authService.getUser(userId)
      const { id, email, name, roles, createdAt, lastLogin } = user
      return NextResponse.json({ data: { id, email, name, roles, createdAt, lastLogin } })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleCreateUser(request: NextRequest): Promise<NextResponse> {
    const rawBody: unknown = await request.json()
    if (!rawBody || Array.isArray(rawBody) || typeof rawBody !== 'object') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'User payload must be an object' } },
        { status: 422 }
      )
    }
    const body = rawBody as Record<string, unknown>
    const { id, email, name, password, roles } = body

    if (!isNonEmptyString(id) || !isNonEmptyString(email) || !isNonEmptyString(name) || !isNonEmptyString(password)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'id, email, name, and password are required' } },
        { status: 422 }
      )
    }
    if (!isValidUserId(id)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } },
        { status: 422 }
      )
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' } },
        { status: 422 }
      )
    }
    if (roles !== undefined && (!Array.isArray(roles) || roles.some((role) => !isValidRoleHandle(role)))) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'roles must be an array of role handles' } },
        { status: 422 }
      )
    }
    const requestedRoles = roles ?? []
    if (new Set(requestedRoles).size !== requestedRoles.length || !(await Promise.all(requestedRoles.map(roleExists))).every(Boolean)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'roles must contain existing, unique role handles' } },
        { status: 422 }
      )
    }

    try {
      const user = await authService.createUser({
        id,
        email,
        name,
        password,
        roles: requestedRoles,
      })
      const { passwordHash: _ph, ...safeUser } = user as unknown as Record<string, unknown>
      return NextResponse.json({ data: safeUser }, { status: 201 })
    } catch (error) {
      if (error instanceof ConflictError) {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: error.message } },
          { status: 409 }
        )
      }
      throw error
    }
  }

  async function handleUpdateUser(
    request: NextRequest,
    userId: string
  ): Promise<NextResponse> {
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } }, { status: 422 })
    }
    const body = await request.json()
    const { email, name, password, roles, theme } = body

    // Validate email format if provided
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' } },
          { status: 422 }
        )
      }
    }

    try {
      const user = await authService.updateUser(userId, { email, name, password, roles, theme })
      const { passwordHash: _ph, ...safeUser } = user as unknown as Record<string, unknown>
      return NextResponse.json({ data: safeUser })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleUpdateOwnUser(
    request: NextRequest,
    userId: string
  ): Promise<NextResponse> {
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } }, { status: 422 })
    }
    const body = await request.json()
    const { email, name, theme } = body
    const allowedFields = ['email', 'name', 'theme']

    if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
      return NextResponse.json(
        { error: { code: 'AUTHORIZATION_ERROR', message: 'Users may only update their own profile details' } },
        { status: 403 }
      )
    }

    if (email !== undefined && !isValidEmail(email)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid email address' } },
        { status: 422 }
      )
    }

    if (theme !== undefined && theme !== 'light' && theme !== 'dark') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Theme must be light or dark' } },
        { status: 422 }
      )
    }

    try {
      const user = await authService.updateUser(userId, { email, name, theme })
      const { passwordHash: _ph, ...safeUser } = user as unknown as Record<string, unknown>
      return NextResponse.json({ data: safeUser })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleDeleteUser(
    _request: NextRequest,
    userId: string
  ): Promise<NextResponse> {
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } }, { status: 422 })
    }
    try {
      await authService.deleteUser(userId)
      return NextResponse.json({ success: true })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  async function handleChangePassword(
    request: NextRequest,
    userId: string
  ): Promise<NextResponse> {
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user id' } }, { status: 422 })
    }
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'currentPassword and newPassword are required' } },
        { status: 422 }
      )
    }

    try {
      const user = await authService.getUser(userId)

      // Verify current password against stored hash
      const isValid = await verifyPassword(currentPassword, user.passwordHash)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        )
      }

      // Update the user with the new password (provider handles hashing)
      await authService.updateUser(userId, { password: newPassword })

      return NextResponse.json({ success: true })
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: error.message } },
          { status: 404 }
        )
      }
      throw error
    }
  }

  return {
    handleListUsers,
    handleGetUser,
    handleCreateUser,
    handleUpdateUser,
    handleUpdateOwnUser,
    handleDeleteUser,
    handleChangePassword,
  }
}
