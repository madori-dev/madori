import * as fs from 'fs/promises'
import { yamlWriter } from '../utils/yaml-writer.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'

import type { CollectionDefinition, BlueprintDefinition, FieldsetDefinition, BlueprintFieldDefinition } from '../utils/yaml-writer.js'

// --- Interfaces ---

export interface NavigationItem {
  label: string
  url: string
  children?: NavigationItem[]
}

export interface NavigationDefinition {
  handle: string
  items: NavigationItem[]
}

export interface PresetDefinition {
  name: string
  description: string
  collections: CollectionDefinition[]
  blueprints: BlueprintDefinition[]
  fieldsets: FieldsetDefinition[]
  navigations: NavigationDefinition[]
  config: Partial<MadoriConfigInput>
}

export interface MadoriConfigInput {
  contentPath?: string
  resourcesPath?: string
  usersPath?: string
  assetsPath?: string
  cp?: { enabled: boolean; path: string }
  graphql?: { enabled: boolean; path: string; introspection?: boolean }
}

export interface ApplyPresetResult {
  presetName: PresetName
  filesCreated: string[]
  conflicts: string[]
}

// --- Constants ---

export const AVAILABLE_PRESETS = [
  'marketing-site',
  'blog',
  'documentation',
  'saas-landing',
  'agency-portfolio',
] as const

export type PresetName = typeof AVAILABLE_PRESETS[number]

// --- Helpers ---

export function isValidPreset(name: string): name is PresetName {
  return (AVAILABLE_PRESETS as readonly string[]).includes(name)
}

function fields(...defs: Array<[string, string, string?, boolean?]>): BlueprintFieldDefinition[] {
  return defs.map(([handle, type, display, required]) => ({
    handle,
    field: {
      type,
      display: display || handle.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      ...(required ? { required: true } : {}),
    },
  }))
}

// --- Preset Definitions ---

const marketingSitePreset: PresetDefinition = {
  name: 'marketing-site',
  description: 'A marketing website with pages, sections, and team members',
  collections: [
    { title: 'Pages', blueprint: 'pages', route: '/{slug}' },
    { title: 'Sections', blueprint: 'sections' },
    { title: 'Team Members', blueprint: 'team-members', route: '/team/{slug}' },
  ],
  blueprints: [
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['content', 'tiptap', 'Content'],
            ['meta_title', 'text', 'Meta Title'],
            ['meta_description', 'textarea', 'Meta Description'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['type', 'select', 'Section Type'],
            ['content', 'tiptap', 'Content'],
            ['background_image', 'assets', 'Background Image'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['name', 'text', 'Name', true],
            ['slug', 'text', 'Slug', true],
            ['role', 'text', 'Role'],
            ['bio', 'textarea', 'Bio'],
            ['photo', 'assets', 'Photo'],
            ['email', 'text', 'Email'],
          ),
        },
      },
    },
  ],
  fieldsets: [
    {
      handle: 'hero',
      fields: fields(
        ['heading', 'text', 'Heading', true],
        ['subheading', 'textarea', 'Subheading'],
        ['cta_text', 'text', 'CTA Text'],
        ['cta_url', 'text', 'CTA URL'],
        ['background_image', 'assets', 'Background Image'],
      ),
    },
  ],
  navigations: [
    {
      handle: 'main',
      items: [
        { label: 'Home', url: '/' },
        { label: 'About', url: '/about' },
        { label: 'Team', url: '/team' },
        { label: 'Contact', url: '/contact' },
      ],
    },
  ],
  config: {
    contentPath: './content',
    resourcesPath: './resources',
  },
}

const blogPreset: PresetDefinition = {
  name: 'blog',
  description: 'A blog with posts, authors, and categories',
  collections: [
    { title: 'Posts', blueprint: 'posts', route: '/blog/{slug}' },
    { title: 'Authors', blueprint: 'authors', route: '/authors/{slug}' },
    { title: 'Categories', blueprint: 'categories', route: '/blog/category/{slug}' },
  ],
  blueprints: [
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['excerpt', 'textarea', 'Excerpt'],
            ['content', 'tiptap', 'Content', true],
            ['featured_image', 'assets', 'Featured Image'],
            ['published_at', 'date', 'Published At'],
          ),
        },
        meta: {
          label: 'Meta',
          fields: fields(
            ['author', 'text', 'Author'],
            ['category', 'text', 'Category'],
            ['tags', 'tags', 'Tags'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['name', 'text', 'Name', true],
            ['slug', 'text', 'Slug', true],
            ['bio', 'textarea', 'Bio'],
            ['avatar', 'assets', 'Avatar'],
            ['website', 'text', 'Website'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['description', 'textarea', 'Description'],
          ),
        },
      },
    },
  ],
  fieldsets: [],
  navigations: [
    {
      handle: 'main',
      items: [
        { label: 'Home', url: '/' },
        { label: 'Blog', url: '/blog' },
        { label: 'Authors', url: '/authors' },
      ],
    },
    {
      handle: 'sidebar',
      items: [
        { label: 'Recent Posts', url: '/blog' },
        { label: 'Categories', url: '/blog/categories' },
        { label: 'Archives', url: '/blog/archives' },
      ],
    },
  ],
  config: {
    contentPath: './content',
    resourcesPath: './resources',
  },
}

const documentationPreset: PresetDefinition = {
  name: 'documentation',
  description: 'A documentation site with docs and sections',
  collections: [
    { title: 'Docs', blueprint: 'docs', route: '/docs/{slug}' },
    { title: 'Sections', blueprint: 'doc-sections' },
  ],
  blueprints: [
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['content', 'tiptap', 'Content', true],
            ['order', 'integer', 'Order'],
            ['section', 'text', 'Section'],
          ),
        },
        meta: {
          label: 'Meta',
          fields: fields(
            ['description', 'textarea', 'Description'],
            ['last_updated', 'date', 'Last Updated'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['order', 'integer', 'Order'],
            ['icon', 'text', 'Icon'],
          ),
        },
      },
    },
  ],
  fieldsets: [],
  navigations: [
    {
      handle: 'docs',
      items: [
        {
          label: 'Getting Started',
          url: '/docs/getting-started',
          children: [
            { label: 'Installation', url: '/docs/installation' },
            { label: 'Configuration', url: '/docs/configuration' },
          ],
        },
        {
          label: 'Guides',
          url: '/docs/guides',
          children: [
            { label: 'Basic Usage', url: '/docs/basic-usage' },
            { label: 'Advanced', url: '/docs/advanced' },
          ],
        },
        { label: 'API Reference', url: '/docs/api' },
      ],
    },
  ],
  config: {
    contentPath: './content',
    resourcesPath: './resources',
  },
}

const saasLandingPreset: PresetDefinition = {
  name: 'saas-landing',
  description: 'A SaaS landing page with features, pricing plans, and testimonials',
  collections: [
    { title: 'Features', blueprint: 'features' },
    { title: 'Pricing Plans', blueprint: 'pricing-plans', route: '/pricing/{slug}' },
    { title: 'Testimonials', blueprint: 'testimonials' },
  ],
  blueprints: [
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['description', 'textarea', 'Description', true],
            ['icon', 'text', 'Icon'],
            ['order', 'integer', 'Order'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['name', 'text', 'Name', true],
            ['slug', 'text', 'Slug', true],
            ['price', 'text', 'Price', true],
            ['billing_period', 'select', 'Billing Period'],
            ['description', 'textarea', 'Description'],
            ['featured', 'toggle', 'Featured'],
          ),
        },
        details: {
          label: 'Details',
          fields: fields(
            ['features_list', 'textarea', 'Features List'],
            ['cta_text', 'text', 'CTA Text'],
            ['cta_url', 'text', 'CTA URL'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['author_name', 'text', 'Author Name', true],
            ['author_role', 'text', 'Author Role'],
            ['author_company', 'text', 'Company'],
            ['quote', 'textarea', 'Quote', true],
            ['avatar', 'assets', 'Avatar'],
            ['rating', 'integer', 'Rating'],
          ),
        },
      },
    },
  ],
  fieldsets: [],
  navigations: [
    {
      handle: 'main',
      items: [
        { label: 'Features', url: '/#features' },
        { label: 'Pricing', url: '/pricing' },
        { label: 'Testimonials', url: '/#testimonials' },
        { label: 'Sign Up', url: '/signup' },
      ],
    },
  ],
  config: {
    contentPath: './content',
    resourcesPath: './resources',
  },
}

const agencyPortfolioPreset: PresetDefinition = {
  name: 'agency-portfolio',
  description: 'An agency portfolio site with projects, team, and services',
  collections: [
    { title: 'Projects', blueprint: 'projects', route: '/work/{slug}' },
    { title: 'Team', blueprint: 'team', route: '/team/{slug}' },
    { title: 'Services', blueprint: 'services', route: '/services/{slug}' },
  ],
  blueprints: [
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['client', 'text', 'Client'],
            ['description', 'textarea', 'Description', true],
            ['content', 'tiptap', 'Content'],
            ['featured_image', 'assets', 'Featured Image'],
          ),
        },
        meta: {
          label: 'Meta',
          fields: fields(
            ['date_completed', 'date', 'Date Completed'],
            ['services_used', 'tags', 'Services Used'],
            ['url', 'text', 'Project URL'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['name', 'text', 'Name', true],
            ['slug', 'text', 'Slug', true],
            ['role', 'text', 'Role', true],
            ['bio', 'textarea', 'Bio'],
            ['photo', 'assets', 'Photo'],
          ),
        },
        contact: {
          label: 'Contact',
          fields: fields(
            ['email', 'text', 'Email'],
            ['linkedin', 'text', 'LinkedIn'],
            ['twitter', 'text', 'Twitter'],
          ),
        },
      },
    },
    {
      tabs: {
        main: {
          label: 'Main',
          fields: fields(
            ['title', 'text', 'Title', true],
            ['slug', 'text', 'Slug', true],
            ['description', 'textarea', 'Description', true],
            ['icon', 'text', 'Icon'],
            ['content', 'tiptap', 'Content'],
          ),
        },
      },
    },
  ],
  fieldsets: [],
  navigations: [
    {
      handle: 'main',
      items: [
        { label: 'Work', url: '/work' },
        { label: 'Services', url: '/services' },
        { label: 'Team', url: '/team' },
        { label: 'Contact', url: '/contact' },
      ],
    },
    {
      handle: 'portfolio',
      items: [
        { label: 'All Projects', url: '/work' },
        { label: 'Web Design', url: '/work?filter=web-design' },
        { label: 'Branding', url: '/work?filter=branding' },
        { label: 'Development', url: '/work?filter=development' },
      ],
    },
  ],
  config: {
    contentPath: './content',
    resourcesPath: './resources',
  },
}

// --- Preset Registry ---

const presetRegistry: Record<PresetName, PresetDefinition> = {
  'marketing-site': marketingSitePreset,
  'blog': blogPreset,
  'documentation': documentationPreset,
  'saas-landing': saasLandingPreset,
  'agency-portfolio': agencyPortfolioPreset,
}

// --- Public API ---

export function getPreset(name: PresetName): PresetDefinition {
  return presetRegistry[name]
}

/**
 * Check whether a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Apply a preset to the current project.
 * Writes collections, blueprints, fieldsets, and navigations to disk.
 */
export async function applyPreset(
  name: PresetName,
  options?: { force?: boolean }
): Promise<ApplyPresetResult> {
  const preset = getPreset(name)
  const force = options?.force ?? false
  const filesCreated: string[] = []
  const conflicts: string[] = []

  // 1. Resolve all target paths and check for conflicts
  const collectionPaths = preset.collections.map((c) =>
    resolveProjectPath('resources', 'collections', `${c.blueprint}.yaml`)
  )
  const blueprintPaths = preset.collections.map((c) =>
    resolveProjectPath('resources', 'blueprints', 'collections', `${c.blueprint}.yaml`)
  )
  const fieldsetPaths = preset.fieldsets.map((f) =>
    resolveProjectPath('resources', 'fieldsets', `${f.handle}.yaml`)
  )
  const navigationPaths = preset.navigations.map((n) =>
    resolveProjectPath('content', 'navigation', `${n.handle}.yaml`)
  )

  const allPaths = [...collectionPaths, ...blueprintPaths, ...fieldsetPaths, ...navigationPaths]

  // 2. Check for conflicting local resources
  for (const filePath of allPaths) {
    if (await fileExists(filePath)) {
      conflicts.push(filePath)
    }
  }

  if (conflicts.length > 0 && !force) {
    return { presetName: name, filesCreated, conflicts }
  }

  // 3. Write collections
  for (let i = 0; i < preset.collections.length; i++) {
    const collectionDef = preset.collections[i]
    const collectionPath = collectionPaths[i]
    await yamlWriter.writeCollection(collectionPath, collectionDef)
    filesCreated.push(collectionPath)
  }

  // 4. Write blueprints
  for (let i = 0; i < preset.blueprints.length; i++) {
    const blueprintDef = preset.blueprints[i]
    const blueprintPath = blueprintPaths[i]
    await yamlWriter.writeBlueprint(blueprintPath, blueprintDef)
    filesCreated.push(blueprintPath)
  }

  // 5. Write fieldsets
  for (let i = 0; i < preset.fieldsets.length; i++) {
    const fieldsetDef = preset.fieldsets[i]
    const fieldsetPath = fieldsetPaths[i]
    await yamlWriter.writeFieldset(fieldsetPath, fieldsetDef)
    filesCreated.push(fieldsetPath)
  }

  // 6. Write navigations
  for (let i = 0; i < preset.navigations.length; i++) {
    const navDef = preset.navigations[i]
    const navPath = navigationPaths[i]
    await writeNavigation(navPath, navDef)
    filesCreated.push(navPath)
  }

  return { presetName: name, filesCreated, conflicts }
}

/**
 * Write a navigation definition to a YAML file.
 */
async function writeNavigation(filePath: string, definition: NavigationDefinition): Promise<void> {
  const { stringify } = await import('yaml')
  const dir = await import('path')
  const dirPath = dir.dirname(filePath)
  await fs.mkdir(dirPath, { recursive: true })

  const output = stringify({ items: definition.items })
  await fs.writeFile(filePath, output, 'utf-8')
}
