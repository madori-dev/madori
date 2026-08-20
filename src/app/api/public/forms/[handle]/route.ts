import { NextResponse } from 'next/server'

import { getMadori } from '@/lib/madori'
import { ValidationError } from '@/lib/errors'
import { isPublicFormField } from '@/lib/forms/public-fields'

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params
    const { contentEngine } = await getMadori()
    const form = await contentEngine.getForm(handle)
    if (!form) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Form not found' } }, { status: 404 })
    const fields = form.fields.filter(isPublicFormField)
    const unsupportedRequired = form.fields.filter((field) => !isPublicFormField(field) && Boolean((field as { field?: { required?: boolean } }).field?.required))
    if (unsupportedRequired.length) {
      return NextResponse.json({ error: { code: 'UNSUPPORTED_PUBLIC_FORM_FIELDS', message: 'Form contains required field types that have no public renderer.', fields: unsupportedRequired.map((field) => (field as { handle?: string }).handle) } }, { status: 422 })
    }
    return NextResponse.json({ data: { ...form, fields, omittedFields: form.fields.length - fields.length } }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' } })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid form handle' } }, { status: 400 })
    }
    throw error
  }
}
