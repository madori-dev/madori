import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput & { collections?: Record<string, unknown> } = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  cp: {
    enabled: true,
    path: '/cp',
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },
}

export default config
