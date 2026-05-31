import { describe, it, expect } from 'vitest'
import { UniversalFileParser, UnsupportedFormatError } from '@/lib/fs/parser'

describe('UniversalFileParser', () => {
  const parser = new UniversalFileParser()

  describe('detectFormat', () => {
    it('returns "yaml" for .yaml extension', () => {
      expect(parser.detectFormat('data/config.yaml')).toBe('yaml')
    })

    it('returns "yaml" for .yml extension', () => {
      expect(parser.detectFormat('data/config.yml')).toBe('yaml')
    })

    it('returns "json" for .json extension', () => {
      expect(parser.detectFormat('data/config.json')).toBe('json')
    })

    it('is case-insensitive for extensions', () => {
      expect(parser.detectFormat('file.YAML')).toBe('yaml')
      expect(parser.detectFormat('file.JSON')).toBe('json')
      expect(parser.detectFormat('file.Yml')).toBe('yaml')
    })

    it('throws UnsupportedFormatError for unknown extensions', () => {
      expect(() => parser.detectFormat('file.txt')).toThrow(UnsupportedFormatError)
      expect(() => parser.detectFormat('file.xml')).toThrow(UnsupportedFormatError)
      expect(() => parser.detectFormat('file.toml')).toThrow(UnsupportedFormatError)
    })

    it('throws with descriptive message listing supported extensions', () => {
      try {
        parser.detectFormat('file.txt')
      } catch (e) {
        expect((e as Error).message).toContain('.txt')
        expect((e as Error).message).toContain('.yaml')
        expect((e as Error).message).toContain('.yml')
        expect((e as Error).message).toContain('.json')
      }
    })
  })

  describe('parse', () => {
    it('parses YAML content from .yaml file', () => {
      const content = 'title: Hello\ncount: 42\n'
      const result = parser.parse<{ title: string; count: number }>('file.yaml', content)
      expect(result).toEqual({ title: 'Hello', count: 42 })
    })

    it('parses YAML content from .yml file', () => {
      const content = 'name: test\n'
      const result = parser.parse<{ name: string }>('file.yml', content)
      expect(result).toEqual({ name: 'test' })
    })

    it('parses JSON content from .json file', () => {
      const content = '{"title": "Hello", "count": 42}'
      const result = parser.parse<{ title: string; count: number }>('file.json', content)
      expect(result).toEqual({ title: 'Hello', count: 42 })
    })

    it('throws UnsupportedFormatError for unknown extensions', () => {
      expect(() => parser.parse('file.txt', 'content')).toThrow(UnsupportedFormatError)
    })
  })

  describe('serialize', () => {
    it('serializes to JSON with 2-space indentation and trailing newline', () => {
      const data = { title: 'Hello', count: 42 }
      const result = parser.serialize(data, 'json')
      expect(result).toBe('{\n  "title": "Hello",\n  "count": 42\n}\n')
    })

    it('serializes to YAML', () => {
      const data = { title: 'Hello', count: 42 }
      const result = parser.serialize(data, 'yaml')
      expect(result).toContain('title: Hello')
      expect(result).toContain('count: 42')
    })

    it('handles nested objects in JSON', () => {
      const data = { meta: { author: 'test', tags: ['a', 'b'] } }
      const result = parser.serialize(data, 'json')
      const parsed = JSON.parse(result)
      expect(parsed).toEqual(data)
    })

    it('handles nested objects in YAML', () => {
      const data = { meta: { author: 'test', tags: ['a', 'b'] } }
      const result = parser.serialize(data, 'yaml')
      expect(result).toContain('author: test')
    })
  })
})
