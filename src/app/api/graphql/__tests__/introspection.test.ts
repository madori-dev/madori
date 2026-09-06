import { describe, expect, it } from 'vitest'
import { createYoga, createSchema } from 'graphql-yoga'
import { introspectionPolicy } from '@/lib/graphql/introspection'

const schema = createSchema({ typeDefs: 'type Query { hello: String }' })
const makeYoga = (enabled = false) => createYoga({ schema, plugins: [introspectionPolicy(enabled)], logging: false, maskedErrors: false })

describe('GraphQL introspection policy', () => {
  it('permits __typename needed by GraphQL clients', async () => {
    const response = await makeYoga().fetch('http://localhost/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }) })
    expect(await response.json()).toEqual({ data: { __typename: 'Query' } })
  })

  it('permits ordinary GET queries while introspection is disabled', async () => {
    const response = await makeYoga().fetch('http://localhost/graphql?query=%7Bhello%7D')
    expect(await response.json()).toEqual({ data: { hello: null } })
  })

  it.each(['json', 'multipart', 'get'])('rejects schema introspection after %s request decoding', async (transport) => {
    const query = '{ alias: __schema { queryType { name } } }'
    let request: Request
    if (transport === 'multipart') {
      const body = new FormData()
      body.set('operations', JSON.stringify({ query }))
      body.set('map', '{}')
      request = new Request('http://localhost/graphql', { method: 'POST', body })
    } else if (transport === 'get') {
      request = new Request(`http://localhost/graphql?query=${encodeURIComponent(query)}`)
    } else {
      const body = JSON.stringify({ query }).replace('__schema', '\\u005f\\u005fschema')
      request = new Request('http://localhost/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    }
    const result = await (await makeYoga().fetch(request)).json()
    expect(result.data).toBeUndefined()
    expect(result.errors[0].message).toContain('introspection')
  })

  it('allows schema discovery when enabled', async () => {
    const result = await (await makeYoga(true).fetch('http://localhost/graphql?query=%7B__schema%7BqueryType%7Bname%7D%7D%7D')).json()
    expect(result.errors).toBeUndefined()
    expect(result.data.__schema.queryType.name).toBe('Query')
  })
})
