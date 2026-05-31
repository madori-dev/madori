import { NextRequest, NextResponse } from 'next/server'
import { FormOperations } from '@/lib/content/forms'
import { NotFoundError } from '@/lib/errors'

export function createFormHandlers(formOps: FormOperations) {
  async function handleListForms(): Promise<NextResponse> {
    const forms = await formOps.listForms()
    return NextResponse.json({ data: forms })
  }

  async function handleGetForm(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const form = await formOps.getForm(handle)
    if (!form) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Form "${handle}" not found` } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: form })
  }

  async function handleSubmitForm(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const body = await request.json()

    try {
      const submission = await formOps.submitForm(handle, body)
      return NextResponse.json({ data: submission }, { status: 201 })
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

  return { handleListForms, handleGetForm, handleSubmitForm }
}
