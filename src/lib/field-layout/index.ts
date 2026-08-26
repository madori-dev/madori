import type {
  Blueprint,
  BlueprintSection,
  BlueprintTab,
  FieldDefinition,
} from '@/lib/blueprints/types'

export type FieldListMutation =
  | { type: 'add'; field?: FieldDefinition }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'update'; index: number; field: FieldDefinition }

export type FieldTarget = {
  tabKey: string
  sectionKey?: string
  fieldIndex: number
}

export type FieldLayoutMutation =
  | { type: 'tab.add' }
  | { type: 'tab.remove'; tabKey: string }
  | { type: 'tab.rename'; tabKey: string; display: string }
  | { type: 'section.add'; tabKey: string }
  | { type: 'section.remove'; tabKey: string; sectionKey: string }
  | { type: 'section.update'; tabKey: string; sectionKey: string; section: BlueprintSection }
  | { type: 'field.edit'; target: Omit<FieldTarget, 'fieldIndex'>; mutation: FieldListMutation }

export function emptyField(): FieldDefinition {
  return { handle: '', field: { type: 'text' } }
}

/** Apply every flat field edit through one immutable, bounds-safe interface. */
export function editFieldList(
  fields: readonly FieldDefinition[],
  mutation: FieldListMutation,
): FieldDefinition[] {
  if (mutation.type === 'add') return [...fields, mutation.field ?? emptyField()]
  if (mutation.type === 'remove') return fields.filter((_, index) => index !== mutation.index)

  if (mutation.type === 'update') {
    if (!fields[mutation.index]) return [...fields]
    return fields.map((field, index) => index === mutation.index ? mutation.field : field)
  }

  if (
    mutation.from < 0
    || mutation.from >= fields.length
    || mutation.to < 0
    || mutation.to >= fields.length
    || mutation.from === mutation.to
  ) return [...fields]

  const next = [...fields]
  const [moved] = next.splice(mutation.from, 1)
  next.splice(mutation.to, 0, moved)
  return next
}

/** Apply tab, section, and field edits without exposing nested update mechanics. */
export function editFieldLayout(blueprint: Blueprint, mutation: FieldLayoutMutation): Blueprint {
  if (mutation.type === 'tab.add') {
    const tabKey = nextKey('tab', Object.keys(blueprint.tabs))
    return withTabs(blueprint, { ...blueprint.tabs, [tabKey]: { fields: [] } })
  }

  if (mutation.type === 'tab.remove') {
    if (!blueprint.tabs[mutation.tabKey] || Object.keys(blueprint.tabs).length === 1) return blueprint
    const { [mutation.tabKey]: _removed, ...tabs } = blueprint.tabs
    return withTabs(blueprint, tabs)
  }

  const tabKey = mutation.type === 'field.edit' ? mutation.target.tabKey : mutation.tabKey
  const tab = blueprint.tabs[tabKey]
  if (!tab) return blueprint

  if (mutation.type === 'tab.rename') {
    return updateTab(blueprint, mutation.tabKey, {
      ...tab,
      display: mutation.display || undefined,
    })
  }

  if (mutation.type === 'section.add') {
    const sectionKey = nextKey('section', Object.keys(tab.sections ?? {}))
    return updateTab(blueprint, mutation.tabKey, {
      ...tab,
      sections: { ...tab.sections, [sectionKey]: { fields: [] } },
    })
  }

  if (mutation.type === 'section.remove') {
    const { [mutation.sectionKey]: _removed, ...sections } = tab.sections ?? {}
    return updateTab(blueprint, mutation.tabKey, { ...tab, sections })
  }

  if (mutation.type === 'section.update') {
    return updateTab(blueprint, mutation.tabKey, {
      ...tab,
      sections: { ...tab.sections, [mutation.sectionKey]: mutation.section },
    })
  }

  if (mutation.target.sectionKey) {
    const section = tab.sections?.[mutation.target.sectionKey]
    if (!section) return blueprint
    return updateTab(blueprint, mutation.target.tabKey, {
      ...tab,
      sections: {
        ...tab.sections,
        [mutation.target.sectionKey]: {
          ...section,
          fields: editFieldList(section.fields, mutation.mutation),
        },
      },
    })
  }

  return updateTab(blueprint, mutation.target.tabKey, {
    ...tab,
    fields: editFieldList(tab.fields, mutation.mutation),
  })
}

export function fieldAt(blueprint: Blueprint, target: FieldTarget | null): FieldDefinition | null {
  if (!target) return null
  const tab = blueprint.tabs[target.tabKey]
  const fields = target.sectionKey ? tab?.sections?.[target.sectionKey]?.fields : tab?.fields
  return fields?.[target.fieldIndex] ?? null
}

function nextKey(prefix: 'tab' | 'section', keys: readonly string[]): string {
  const existing = new Set(keys)
  let index = existing.size + 1
  while (existing.has(`${prefix}_${index}`)) index++
  return `${prefix}_${index}`
}

function withTabs(blueprint: Blueprint, tabs: Record<string, BlueprintTab>): Blueprint {
  return { ...blueprint, tabs }
}

function updateTab(blueprint: Blueprint, tabKey: string, tab: BlueprintTab): Blueprint {
  return withTabs(blueprint, { ...blueprint.tabs, [tabKey]: tab })
}
