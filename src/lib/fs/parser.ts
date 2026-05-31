import matter from 'gray-matter'
import { parse as parseYamlString, stringify as stringifyYaml } from 'yaml'
import * as path from 'path'

export interface ContentParser {
  parseMarkdown(raw: string): { frontmatter: Record<string, unknown>; content: string }
  serializeMarkdown(frontmatter: Record<string, unknown>, content: string): string
  parseYaml<T>(raw: string): T
  serializeYaml(data: unknown): string
}

export class MarkdownYamlParser implements ContentParser {
  parseMarkdown(raw: string): { frontmatter: Record<string, unknown>; content: string } {
    const { data, content } = matter(raw)
    return {
      frontmatter: data as Record<string, unknown>,
      content: content.trim(),
    }
  }

  serializeMarkdown(frontmatter: Record<string, unknown>, content: string): string {
    const yamlBlock = stringifyYaml(frontmatter, { lineWidth: 0 }).trim()
    return `---\n${yamlBlock}\n---\n\n${content}\n`
  }

  parseYaml<T>(raw: string): T {
    if (!raw || !raw.trim()) {
      return {} as T
    }
    const parsed = parseYamlString(raw)
    if (parsed === null || parsed === undefined) {
      return {} as T
    }
    return parsed as T
  }

  serializeYaml(data: unknown): string {
    return stringifyYaml(data, { lineWidth: 0 })
  }
}

// --- Universal File Parser (YAML/JSON auto-detect) ---

export type FileFormat = 'yaml' | 'json'

export class UnsupportedFormatError extends Error {
  constructor(extension: string, supported: string[]) {
    super(`Unsupported file extension "${extension}". Supported: ${supported.join(', ')}`)
    this.name = 'UnsupportedFormatError'
  }
}

export interface FileParser {
  detectFormat(filePath: string): FileFormat
  parse<T>(filePath: string, content: string): T
  serialize(data: unknown, format: FileFormat): string
}

export class UniversalFileParser implements FileParser {
  private static readonly YAML_EXTENSIONS = ['.yaml', '.yml']
  private static readonly JSON_EXTENSIONS = ['.json']
  private static readonly SUPPORTED_EXTENSIONS = [
    ...UniversalFileParser.YAML_EXTENSIONS,
    ...UniversalFileParser.JSON_EXTENSIONS,
  ]

  detectFormat(filePath: string): FileFormat {
    const ext = path.extname(filePath).toLowerCase()
    if (UniversalFileParser.YAML_EXTENSIONS.includes(ext)) return 'yaml'
    if (UniversalFileParser.JSON_EXTENSIONS.includes(ext)) return 'json'
    throw new UnsupportedFormatError(ext, UniversalFileParser.SUPPORTED_EXTENSIONS)
  }

  parse<T>(filePath: string, content: string): T {
    const format = this.detectFormat(filePath)
    if (format === 'json') {
      return JSON.parse(content) as T
    }
    return parseYamlString(content) as T
  }

  serialize(data: unknown, format: FileFormat): string {
    if (format === 'json') {
      return JSON.stringify(data, null, 2) + '\n'
    }
    return stringifyYaml(data, { lineWidth: 0 })
  }
}
