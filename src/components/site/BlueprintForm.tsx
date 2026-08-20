'use client'

import { useEffect, useState } from 'react'
import { FormField, MadoriForm } from './MadoriForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PublicField = { handle: string; field: { type?: string; display?: string; required?: boolean; options?: Record<string, unknown> } }
type PublicForm = { display: string; fields: PublicField[]; omittedFields?: number }

/** Form generated from CP blueprint. Use MadoriForm directly for custom layouts. */
export function BlueprintForm({ handle, className, submitLabel = 'Submit' }: { handle: string; className?: string; submitLabel?: string }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/public/forms/${encodeURIComponent(handle)}`).then(async (response) => {
      if (!response.ok) throw new Error('Form unavailable')
      return response.json() as Promise<{ data: PublicForm }>
    }).then(({ data }) => { if (!cancelled) setForm(data) }).catch(() => { if (!cancelled) setError('Form unavailable') })
    return () => { cancelled = true }
  }, [handle])

  if (error) return <p role="alert">{error}</p>
  if (!form) return <p aria-live="polite">Loading form…</p>

  const fieldTypes = Object.fromEntries(form.fields.filter(({ field }) => field.type === 'number' || field.type === 'toggle' || field.type === 'multiselect').map(({ handle: fieldHandle, field }) => [fieldHandle, field.type])) as Record<string, 'number' | 'toggle' | 'multiselect'>
  return <MadoriForm handle={handle} fieldTypes={fieldTypes} className={className} successMessage={<p>Thank you — your submission has been received.</p>}>
    {({ errors, submitting }) => <>
      {form.fields.map(({ handle: fieldHandle, field }) => <BlueprintField key={fieldHandle} handle={fieldHandle} field={field} errors={errors[fieldHandle]} />)}
      <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : submitLabel}</Button>
    </>}
  </MadoriForm>
}

function BlueprintField({ handle, field, errors }: { handle: string; field: PublicField['field']; errors?: string[] }) {
  if (field.type === 'hidden') return <input type="hidden" name={handle} />
  const label = field.display ?? handle
  const required = field.required === true
  if (field.type === 'markdown' || field.type === 'tiptap' || field.type === 'code' || field.type === 'yaml') return <FormField handle={handle} label={label} errors={errors}><textarea id={handle} name={handle} required={required} className="min-h-28 w-full rounded-md border bg-background px-3 py-2" /></FormField>
  if (field.type === 'select' || field.type === 'multiselect') {
    const options = selectOptions(field.options)
    return <FormField handle={handle} label={label} errors={errors}><select id={handle} name={handle} required={required} multiple={field.type === 'multiselect'} className="w-full rounded-md border bg-background px-3 py-2"><option value="">Select…</option>{options.map(({ value, label: optionLabel }) => <option key={value} value={value}>{optionLabel}</option>)}</select></FormField>
  }
  if (field.type === 'toggle') return <FormField handle={handle} label={label} errors={errors}><input type="hidden" name={handle} value="false" /><input id={handle} name={handle} type="checkbox" value="true" /></FormField>
  const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : handle.toLowerCase().includes('email') ? 'email' : 'text'
  return <FormField handle={handle} label={label} errors={errors}><Input id={handle} name={handle} type={type} required={required} /></FormField>
}

function selectOptions(options: Record<string, unknown> | undefined): Array<{ value: string; label: string }> {
  const source = options?.options ?? options
  if (Array.isArray(source)) return source.filter((value): value is string => typeof value === 'string').map((value) => ({ value, label: value }))
  if (!source || typeof source !== 'object') return []
  return Object.entries(source).map(([value, label]) => ({ value, label: typeof label === 'string' ? label : value }))
}
