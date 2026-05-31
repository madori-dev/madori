import { NextRequest, NextResponse } from 'next/server'
import type { ComposedAuthService } from '@/lib/auth/composer'
import { NotFoundError, ConflictError } from '@/lib/errors'

/**
 * User handlers that operate via ComposedAuthService for all user CRUD.
 */
export function createUserHandlers(authService: ComposedAuthService) {
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
    const body = await request.json()
    const { id, email, name, password, roles } = body

    if (!id || !email || !name || !password) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'id, email, name, and password are required' } },
        { status: 422 }
      )
    }

    try {
      const user = await authService.createUser({
        id,
        email,
        name,
        password,
        roles: roles ?? [],
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
    const body = await request.json()
    const { email, name, password, roles } = body

    try {
      const user = await authService.updateUser(userId, { email, name, password, roles })
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

  return {
    handleListUsers,
    handleGetUser,
    handleCreateUser,
    handleUpdateUser,
    handleDeleteUser,
  }
}
