import Link from 'next/link'
import {
  FolderOpen,
  Tags,
  Globe,
  Navigation,
  Image,
  FileText,
  Users,
} from 'lucide-react'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const sections = [
  { label: 'Collections', href: '/cp/collections', description: 'Manage structured content', icon: FolderOpen },
  { label: 'Taxonomies', href: '/cp/taxonomies', description: 'Organize content with categories and tags', icon: Tags },
  { label: 'Globals', href: '/cp/globals', description: 'Edit site-wide settings', icon: Globe },
  { label: 'Navigation', href: '/cp/navigation', description: 'Build navigation menus', icon: Navigation },
  { label: 'Assets', href: '/cp/assets', description: 'Upload and manage files', icon: Image },
  { label: 'Forms', href: '/cp/forms', description: 'View form submissions', icon: FileText },
  { label: 'Users', href: '/cp/users', description: 'Manage users and roles', icon: Users },
]

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to MADORI</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your content, assets, and settings from the Control Panel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="group">
            <Card className="h-full transition-colors hover:bg-accent/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <section.icon className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{section.label}</CardTitle>
                    <CardDescription className="text-xs">
                      {section.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
