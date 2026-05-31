'use client'

import { useParams } from 'next/navigation'
import DefinitionForm from '../../../components/DefinitionForm'

export default function EditNavigationPage() {
  const params = useParams()
  const handle = params.handle as string

  return (
    <DefinitionForm
      entityType="navigations"
      mode="edit"
      handle={handle}
      listPath="/cp/navigation"
      title="Edit Navigation"
    />
  )
}
