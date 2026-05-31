'use client'

import DefinitionForm from '../../components/DefinitionForm'

export default function CreateTaxonomyPage() {
  return (
    <DefinitionForm
      entityType="taxonomies"
      mode="create"
      listPath="/cp/taxonomies"
      title="Create Taxonomy"
    />
  )
}
