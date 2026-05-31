'use client'

import { useParams } from 'next/navigation'
import DefinitionForm from '../../../components/DefinitionForm'

export default function EditTaxonomyPage() {
  const params = useParams()
  const handle = params.handle as string

  return (
    <DefinitionForm
      entityType="taxonomies"
      mode="edit"
      handle={handle}
      listPath="/cp/taxonomies"
      title="Edit Taxonomy"
    />
  )
}
