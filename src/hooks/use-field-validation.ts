'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import type { FieldDefinition } from '@/lib/blueprints/types'
import { validateFields } from '@/lib/validation'
import type { ValidationResult } from '@/lib/validation'

export interface UseFieldValidationOptions {
  /** Validate on every field change (debounced). Default: false */
  validateOnChange?: boolean
  /** Debounce delay in ms for onChange validation. Default: 150 */
  debounceMs?: number
}

export interface UseFieldValidationReturn {
  /** Current field errors keyed by field handle */
  errors: Record<string, string[]>
  /** Whether validation is currently running */
  validating: boolean
  /** Validate all fields. Returns the validation result. */
  validate: (values: Record<string, unknown>) => ValidationResult
  /** Validate a single field. Returns errors for that field. */
  validateField: (handle: string, value: unknown) => string[]
  /** Set errors from an external source (e.g., API response) */
  setErrors: (errors: Record<string, string[]>) => void
  /** Clear errors for a specific field */
  clearFieldError: (handle: string) => void
  /** Clear all errors */
  clearErrors: () => void
  /** Whether any errors exist */
  hasErrors: boolean
}

/**
 * Hook for client-side field validation using the shared validation engine.
 * Provides instant (<100ms) validation feedback by running Zod schemas locally.
 *
 * Usage:
 * ```ts
 * const { errors, validate, clearFieldError, setErrors } = useFieldValidation(fields)
 * ```
 */
export function useFieldValidation(
  fields: FieldDefinition[],
  options: UseFieldValidationOptions = {}
): UseFieldValidationReturn {
  const { validateOnChange: _validateOnChange = false, debounceMs: _debounceMs = 150 } = options
  const [errors, setErrorsState] = useState<Record<string, string[]>>({})
  const [, startTransition] = useTransition()
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const validate = useCallback(
    (values: Record<string, unknown>): ValidationResult => {
      // Build field config map from field definitions
      const fieldConfigs: Record<string, FieldDefinition['field']> = {}
      for (const fieldDef of fieldsRef.current) {
        fieldConfigs[fieldDef.handle] = fieldDef.field
      }

      const result = validateFields(fieldConfigs, values)

      // Use startTransition to avoid blocking the UI — ensures <100ms display
      startTransition(() => {
        setErrorsState(result.errors)
      })

      return result
    },
    [startTransition]
  )

  const validateField = useCallback(
    (handle: string, value: unknown): string[] => {
      const fieldDef = fieldsRef.current.find((f) => f.handle === handle)
      if (!fieldDef) return []

      const result = validateFields(
        { [handle]: fieldDef.field },
        { [handle]: value }
      )

      const fieldErrors = result.errors[handle] ?? []

      startTransition(() => {
        setErrorsState((prev) => {
          if (fieldErrors.length === 0) {
            if (!(handle in prev)) return prev
            const next = { ...prev }
            delete next[handle]
            return next
          }
          return { ...prev, [handle]: fieldErrors }
        })
      })

      return fieldErrors
    },
    [startTransition]
  )

  const setErrors = useCallback((newErrors: Record<string, string[]>) => {
    setErrorsState(newErrors)
  }, [])

  const clearFieldError = useCallback((handle: string) => {
    setErrorsState((prev) => {
      if (!(handle in prev)) return prev
      const next = { ...prev }
      delete next[handle]
      return next
    })
  }, [])

  const clearErrors = useCallback(() => {
    setErrorsState({})
  }, [])

  return {
    errors,
    validating: false,
    validate,
    validateField,
    setErrors,
    clearFieldError,
    clearErrors,
    hasErrors: Object.keys(errors).length > 0,
  }
}
