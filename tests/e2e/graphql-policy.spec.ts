import { expect, test } from '@playwright/test'

test('production GraphQL permits GET queries while disabling introspection and its UI', async ({ request }) => {
  const normal = await request.get('/api/graphql', { params: { query: '{ __typename }' } })
  expect(normal.status()).toBe(200)
  expect(await normal.json()).toEqual({ data: { __typename: 'Query' } })

  const introspection = await request.get('/api/graphql', { params: { query: '{ __schema { queryType { name } } }' } })
  const result = await introspection.json()
  expect(result.data).toBeUndefined()
  expect(result.errors[0].message).toContain('introspection')

  const ui = await request.get('/api/graphql', { headers: { Accept: 'text/html' } })
  expect(ui.status()).toBe(404)
  const queryWithHtmlAccept = await request.get('/api/graphql', {
    params: { query: '{ __typename }' }, headers: { Accept: 'text/html,application/json' },
  })
  expect(queryWithHtmlAccept.headers()['content-type']).not.toContain('text/html')
})
