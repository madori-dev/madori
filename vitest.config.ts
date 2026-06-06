import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@madori/lib': path.resolve(__dirname, './src/lib'),
      '@madori/sdk': path.resolve(__dirname, './packages/madori-sdk/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec,property}.ts', 'src/**/__tests__/**/*.{test,spec,property}.ts', 'packages/**/__tests__/**/*.{test,spec,property}.ts'],
  },
})
