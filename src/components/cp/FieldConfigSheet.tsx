'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { AssetFieldOptions } from '@/components/cp/field-options/AssetFieldOptions'
import { ReplicatorFieldOptions } from '@/components/cp/field-options/ReplicatorFieldOptions'
import { SelectFieldOptions } from '@/components/cp/field-options/SelectFieldOptions'
import { TaxonomyFieldOptions } from '@/components/cp/field-options/TaxonomyFieldOptions'
import { TextFieldOptions } from '@/components/cp/field-options/TextFieldOptions'

import type { FieldConfig, FieldDefinition, FieldType } from '@/lib/blueprints/types'

// All field types available in the type selector
const FIELD_TYPES: FieldType[] = [
  'text',
  'slug',
  'markdown',
  'tiptap',
  'select',
  'multiselect',
  'toggle',
  'number',
  'date',
  'asset',
  'taxonomy',
  'replicator',
  'grid',
]

export interface FieldConfigSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: FieldDefinition | null
  onSave: (updated: FieldDefinition) => void
}

export function FieldConfigSheet({ open, onOpenChange, field, onSave }: FieldConfigSheetProps) {
  const [handle, setHandle] = useState('')
  const [handleManuallyEdited, setHandleManuallyEdited] = useState(false)
  const [display, setDisplay] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [defaultValue, setDefaultValue] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [instructions, setInstructions] = useState('')
  const [validate, setValidate] = useState('')
  const [fieldOptions, setFieldOptions] = useState<Record<string, unknown>>({})

  /** Convert a display name to a snake_case handle */
  function toHandle(displayName: string): string {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  }

  // Re-initialize local state when a new field is opened
  useEffect(() => {
    if (field) {
      setHandle(field.handle ?? '')
      setDisplay(field.field.display ?? '')
      setType(field.field.type ?? 'text')
      setRequired(field.field.required ?? false)
      setDefaultValue(field.field.default != null ? String(field.field.default) : '')
      setPlaceholder((field.field.options?.placeholder as string) ?? '')
      setInstructions(field.field.instructions ?? '')
      setValidate(field.field.validate?.join(', ') ?? '')
      setFieldOptions(field.field.options ?? {})
      // If the field already has a handle, consider it manually set
      setHandleManuallyEdited(!!field.handle)
    } else {
      resetState()
    }
  }, [field])

  function resetState() {
    setHandle('')
    setHandleManuallyEdited(false)
    setDisplay('')
    setType('text')
    setRequired(false)
    setDefaultValue('')
    setPlaceholder('')
    setInstructions('')
    setValidate('')
    setFieldOptions({})
  }

  /** Returns the type-specific options component, or null for types without advanced options. */
  function getOptionsComponent() {
    switch (type) {
      case 'text':
      case 'slug':
      case 'markdown':
      case 'tiptap':
        return TextFieldOptions
      case 'asset':
        return AssetFieldOptions
      case 'taxonomy':
        return TaxonomyFieldOptions
      case 'select':
      case 'multiselect':
        return SelectFieldOptions
      case 'replicator':
      case 'grid':
        return ReplicatorFieldOptions
      default:
        return null
    }
  }

  function renderAdvancedOptions() {
    const OptionsComponent = getOptionsComponent()
    if (!OptionsComponent) return null

    return (
      <>
        <div className="border-t pt-4 mt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Advanced Options
          </h4>
          <OptionsComponent options={fieldOptions} onChange={setFieldOptions} />
        </div>
      </>
    )
  }

  function handleSave() {
    const updatedField: FieldConfig = {
      type,
      ...(display ? { display } : {}),
      ...(instructions ? { instructions } : {}),
      ...(required ? { required: true } : {}),
      ...(defaultValue ? { default: defaultValue } : {}),
      ...(validate ? { validate: validate.split(',').map((r) => r.trim()).filter(Boolean) } : {}),
      options: {
        ...fieldOptions,
        ...(placeholder ? { placeholder } : {}),
      },
      ...(field?.field.visibility ? { visibility: field.field.visibility } : {}),
    }

    // Remove empty options object
    if (Object.keys(updatedField.options ?? {}).length === 0) {
      delete updatedField.options
    }

    onSave({
      handle,
      field: updatedField,
    })
  }

  // Disable save when taxonomy type is selected but no taxonomy handle is configured
  const isTaxonomyInvalid = type === 'taxonomy' && !fieldOptions.taxonomy

  if (!field) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Configure: {field.handle}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-4 py-2">
          {/* Display Name */}
          <div className="space-y-1.5">
            <Label htmlFor="field-display" className="text-xs font-medium">
              Display Name
            </Label>
            <Input
              id="field-display"
              value={display}
              onChange={(e) => {
                const newDisplay = e.target.value
                setDisplay(newDisplay)
                // Auto-generate handle from display name if not manually edited
                if (!handleManuallyEdited) {
                  setHandle(toHandle(newDisplay))
                }
              }}
              placeholder="Display Name"
              className="h-8 text-sm"
            />
          </div>

          {/* Handle */}
          <div className="space-y-1.5">
            <Label htmlFor="field-handle" className="text-xs font-medium">
              Handle
            </Label>
            <Input
              id="field-handle"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value)
                setHandleManuallyEdited(true)
              }}
              placeholder="field_handle"
              className="h-8 text-sm"
            />
          </div>

          {/* Type Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type</Label>
            <Select value={type} onValueChange={(val) => setType(val as FieldType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select field type" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {ft}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Required Toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="field-required"
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
            />
            <Label htmlFor="field-required" className="text-xs font-medium cursor-pointer">
              Required
            </Label>
          </div>

          {/* Default Value */}
          <div className="space-y-1.5">
            <Label htmlFor="field-default" className="text-xs font-medium">
              Default Value
            </Label>
            <Input
              id="field-default"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              placeholder="Default value"
              className="h-8 text-sm"
            />
          </div>

          {/* Placeholder */}
          <div className="space-y-1.5">
            <Label htmlFor="field-placeholder" className="text-xs font-medium">
              Placeholder
            </Label>
            <Input
              id="field-placeholder"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
              placeholder="Placeholder text"
              className="h-8 text-sm"
            />
          </div>

          {/* Help Text / Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="field-instructions" className="text-xs font-medium">
              Help Text
            </Label>
            <textarea
              id="field-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Instructions or help text for content editors"
              rows={3}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 resize-y"
            />
          </div>

          {/* Validation Rules */}
          <div className="space-y-1.5">
            <Label htmlFor="field-validate" className="text-xs font-medium">
              Validation Rules
            </Label>
            <Input
              id="field-validate"
              value={validate}
              onChange={(e) => setValidate(e.target.value)}
              placeholder="required, min:3, max:255"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated validation rules.
            </p>
          </div>

          {/* Advanced Options (type-specific) */}
          {renderAdvancedOptions()}
        </div>

        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>
            Cancel
          </SheetClose>
          <Button onClick={handleSave} disabled={isTaxonomyInvalid}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
