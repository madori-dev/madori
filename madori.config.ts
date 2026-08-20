import type { MadoriConfigInput } from './src/lib/config/schema'

const e2eRoot = process.env.MADORI_E2E === '1' ? './tests/e2e/.madori' : undefined

const config: MadoriConfigInput & { collections?: Record<string, unknown> } = {
  // Browser tests use disposable content so they never alter a developer's site.
  contentPath: e2eRoot ? `${e2eRoot}/content` : './content',
  resourcesPath: e2eRoot ? `${e2eRoot}/resources` : './resources',
  usersPath: e2eRoot ? `${e2eRoot}/users` : './users',
  assetsPath: e2eRoot ? `${e2eRoot}/public/assets` : './public/assets',

  cp: {
    enabled: true,
    path: '/cp',
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },

  seo: {
    errorTracking: Boolean(e2eRoot),
    socialImages: Boolean(e2eRoot),
    operationalStoragePath: e2eRoot ? `${e2eRoot}/storage/seo` : './storage/seo',
  },
}

export default config
