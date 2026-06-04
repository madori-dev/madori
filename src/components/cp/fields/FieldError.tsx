'use client'

interface FieldErrorProps {
  /** Error messages to display */
  errors?: string[]
  /** ID attribute for accessibility linkage via aria-describedby */
  fieldHandle?: string
}

/**
 * Displays field-level validation errors adjacent to form fields.
 * Uses role="alert" to ensure screen readers announce errors immediately.
 * Renders within a single frame to meet the <100ms display requirement.
 */
export function FieldError({ errors, fieldHandle }: FieldErrorProps) {
  if (!errors || errors.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      id={fieldHandle || undefined}
      className="text-xs text-destructive mt-1"
    >
      {errors.map((msg, i) => (
        <p key={i}>{msg}</p>
      ))}
    </div>
  )
}
