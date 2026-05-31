'use client'

import { useParams } from 'next/navigation'
import DefinitionForm from '../../../components/DefinitionForm'

export default function EditFormPage() {
  const params = useParams()
  const handle = params.handle as string

  return (
    <DefinitionForm
      entityType="forms"
      mode="edit"
      handle={handle}
      listPath="/cp/forms"
      title="Edit Form"
    />
  )
}
