'use client'

import { useState, useCallback, type FormEvent, type ReactNode } from 'react'

/**
 * Field-level validation errors returned by the form submission API.
 * Keys are field handles, values are arrays of error messages.
 */
export interface FormFieldErrors {
  [handle: string]: string[]
}

/**
 * Props for the MadoriForm component.
 */
export interface MadoriFormProps {
  /** The form handle — used to construct the submission endpoint */
  handle: string
  /** Optional custom action URL (defaults to /api/forms/{handle}/submit) */
  action?: string
  /** Called after a successful submission */
  onSuccess?: (data: unknown) => void
  /** Called when submission fails (network error or validation error) */
  onError?: (errors: FormFieldErrors | null, message?: string) => void
  /** Form content (fields) */
  children: ReactNode | ((props: { errors: FormFieldErrors; submitting: boolean }) => ReactNode)
  /** Optional CSS class for the form element */
  className?: string
  /** Content to display on successful submission (replaces the form) */
  successMessage?: ReactNode
}

/**
 * Props for the FormField wrapper component that displays errors.
 */
export interface FormFieldProps {
  /** The field handle — must match the name attribute of the input */
  handle: string
  /** The field-level errors for this handle */
  errors?: string[]
  /** The label text */
  label?: string
  /** The field input element(s) */
  children: ReactNode
  /** Optional CSS class */
  className?: string
}

/**
 * FormField — wraps a form input with a label and error display area.
 * Displays validation errors adjacent to the field when present.
 */
export function FormField({ handle, errors, label, children, className }: FormFieldProps) {
  const hasError = errors && errors.length > 0

  return (
    <div className={className}>
      {label && (
        <label htmlFor={handle} className="block text-sm font-medium mb-1">
          {label}
        </label>
      )}
      {children}
      {hasError && (
        <ul
          className="mt-1 space-y-0.5"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
        >
          {errors.map((message, i) => (
            <li
              key={i}
              className="text-sm text-red-600 dark:text-red-400"
            >
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * MadoriForm — a frontend form component that submits to the Madori forms API,
 * handles validation error responses, and displays field-level errors.
 *
 * Usage:
 * ```tsx
 * <MadoriForm handle="contact" successMessage={<p>Thank you!</p>}>
 *   {({ errors, submitting }) => (
 *     <>
 *       <FormField handle="name" label="Name" errors={errors.name}>
 *         <input type="text" id="name" name="name" required />
 *       </FormField>
 *       <FormField handle="email" label="Email" errors={errors.email}>
 *         <input type="email" id="email" name="email" required />
 *       </FormField>
 *       <button type="submit" disabled={submitting}>Send</button>
 *     </>
 *   )}
 * </MadoriForm>
 * ```
 */
export function MadoriForm({
  handle,
  action,
  onSuccess,
  onError,
  children,
  className,
  successMessage,
}: MadoriFormProps) {
  const [errors, setErrors] = useState<FormFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const endpoint = action ?? `/api/forms/${handle}/submit`

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setErrors({})
      setSubmitting(true)

      const formData = new FormData(event.currentTarget)
      const data = Object.fromEntries(formData.entries())

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        if (response.ok) {
          const result = await response.json()
          setSubmitted(true)
          onSuccess?.(result.data)
        } else {
          const result = await response.json()
          if (result.error?.code === 'VALIDATION_ERROR' && result.error?.fields) {
            setErrors(result.error.fields)
            onError?.(result.error.fields, result.error.message)
          } else {
            const message = result.error?.message ?? 'Submission failed'
            onError?.(null, message)
          }
        }
      } catch {
        onError?.(null, 'A network error occurred. Please try again.')
      } finally {
        setSubmitting(false)
      }
    },
    [endpoint, onSuccess, onError]
  )

  if (submitted && successMessage) {
    return <>{successMessage}</>
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      noValidate
    >
      {typeof children === 'function'
        ? children({ errors, submitting })
        : children}
    </form>
  )
}
