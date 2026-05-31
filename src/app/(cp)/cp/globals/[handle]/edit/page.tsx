'use client'

import { useParams } from 'next/navigation'
import DefinitionForm from '../../../components/DefinitionForm'

export default function EditGlobalPage() {
  const params = useParams()
  const handle = params.handle as string

  return (
    <DefinitionForm
      entityType="globals"
      mode="edit"
      handle={handle}
      listPath="/cp/globals"
      title="Edit Global"
    />
  )
}
