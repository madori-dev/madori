import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLString,
  Kind,
  type GraphQLFieldConfigMap,
  type GraphQLFieldResolver,
} from 'graphql'

const SeoJsonScalar = new GraphQLScalarType({
  name: 'SeoJSON',
  description: 'Bounded JSON value validated by SEO domain schemas before persistence.',
  serialize: value => value,
  parseValue: value => value,
  parseLiteral: jsonLiteral,
})

function jsonLiteral(node: import('graphql').ValueNode): unknown {
  switch (node.kind) {
    case Kind.NULL: return null
    case Kind.STRING:
    case Kind.BOOLEAN: return node.value
    case Kind.INT:
    case Kind.FLOAT: return Number(node.value)
    case Kind.LIST: return node.values.map(jsonLiteral)
    case Kind.OBJECT: return Object.fromEntries(node.fields.map(field => [field.name.value, jsonLiteral(field.value)]))
    default: return undefined
  }
}

const SourceType = new GraphQLObjectType({ name: 'SeoSource', fields: { kind: { type: new GraphQLNonNull(GraphQLString) }, value: { type: GraphQLString } } })
const RobotsType = new GraphQLObjectType({ name: 'SeoRobots', fields: { indexing: { type: GraphQLString }, following: { type: GraphQLString }, noarchive: { type: GraphQLBoolean }, noimageindex: { type: GraphQLBoolean }, nosnippet: { type: GraphQLBoolean } } })
const SocialType = new GraphQLObjectType({ name: 'SeoSocial', fields: { image: { type: SourceType }, imageAlt: { type: SourceType }, twitterCard: { type: GraphQLString }, twitterSite: { type: GraphQLString }, twitterCreator: { type: GraphQLString } } })
const SitemapType = new GraphQLObjectType({ name: 'SeoSitemap', fields: { enabled: { type: GraphQLBoolean }, priority: { type: GraphQLFloat }, changeFrequency: { type: GraphQLString } } })
const JsonLdType = new GraphQLObjectType({ name: 'SeoJsonLd', fields: { enabled: { type: GraphQLBoolean }, type: { type: GraphQLString }, custom: { type: SeoJsonScalar } } })
const ValuesType = new GraphQLObjectType({ name: 'SeoValues', fields: { enabled: { type: GraphQLBoolean }, title: { type: SourceType }, description: { type: SourceType }, canonical: { type: SourceType }, robots: { type: RobotsType }, social: { type: SocialType }, sitemap: { type: SitemapType }, jsonLd: { type: JsonLdType } } })
const DocumentMetaType = new GraphQLObjectType({ name: 'SeoDocumentMeta', fields: { revision: { type: new GraphQLNonNull(GraphQLString) } } })
const SiteDataType = new GraphQLObjectType({ name: 'SeoSiteData', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, kind: { type: new GraphQLNonNull(GraphQLString) }, site: { type: new GraphQLNonNull(GraphQLString) }, seo: { type: new GraphQLNonNull(ValuesType) } } })
const SectionDataType = new GraphQLObjectType({ name: 'SeoSectionData', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, kind: { type: new GraphQLNonNull(GraphQLString) }, section: { type: new GraphQLNonNull(GraphQLString) }, handle: { type: new GraphQLNonNull(GraphQLString) }, seo: { type: new GraphQLNonNull(ValuesType) } } })
const SiteDocumentType = new GraphQLObjectType({ name: 'SeoSiteDocument', fields: { data: { type: new GraphQLNonNull(SiteDataType) }, meta: { type: new GraphQLNonNull(DocumentMetaType) } } })
const SectionDocumentType = new GraphQLObjectType({ name: 'SeoSectionDocument', fields: { data: { type: new GraphQLNonNull(SectionDataType) }, meta: { type: new GraphQLNonNull(DocumentMetaType) } } })
const AlternateType = new GraphQLObjectType({ name: 'SeoAlternate', fields: { locale: { type: new GraphQLNonNull(GraphQLString) }, url: { type: new GraphQLNonNull(GraphQLString) } } })
const ResolvedType = new GraphQLObjectType({ name: 'ResolvedSeo', fields: {
  excluded: { type: new GraphQLNonNull(GraphQLBoolean) }, title: { type: GraphQLString }, description: { type: GraphQLString }, canonical: { type: GraphQLString }, indexing: { type: new GraphQLNonNull(GraphQLString) }, following: { type: new GraphQLNonNull(GraphQLString) }, noarchive: { type: GraphQLBoolean }, noimageindex: { type: GraphQLBoolean }, nosnippet: { type: GraphQLBoolean }, sitemapEnabled: { type: new GraphQLNonNull(GraphQLBoolean) }, sitemapPriority: { type: GraphQLFloat }, sitemapChangeFrequency: { type: GraphQLString }, jsonLdEnabled: { type: new GraphQLNonNull(GraphQLBoolean) }, jsonLdType: { type: GraphQLString }, socialImage: { type: GraphQLString }, socialImageAlt: { type: GraphQLString }, twitterCard: { type: GraphQLString }, twitterSite: { type: GraphQLString }, twitterCreator: { type: GraphQLString }, alternates: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(AlternateType))) }, previous: { type: GraphQLString }, next: { type: GraphQLString },
} })
const ProvenanceType = new GraphQLObjectType({ name: 'SeoProvenance', fields: { field: { type: new GraphQLNonNull(GraphQLString) }, source: { type: new GraphQLNonNull(GraphQLString) } } })
const PreviewType = new GraphQLObjectType({ name: 'SeoPreview', fields: { data: { type: new GraphQLNonNull(ResolvedType) }, provenance: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ProvenanceType))) } } })
const AuditSubjectType = new GraphQLObjectType({ name: 'SeoAuditSubject', fields: { id: { type: new GraphQLNonNull(GraphQLString) }, type: { type: new GraphQLNonNull(GraphQLString) }, site: { type: new GraphQLNonNull(GraphQLString) } } })
const AuditIssueType = new GraphQLObjectType({ name: 'SeoAuditIssue', fields: { ruleId: { type: new GraphQLNonNull(GraphQLString) }, severity: { type: new GraphQLNonNull(GraphQLString) }, subject: { type: new GraphQLNonNull(AuditSubjectType) }, message: { type: new GraphQLNonNull(GraphQLString) }, recommendation: { type: new GraphQLNonNull(GraphQLString) }, field: { type: GraphQLString } } })
const AuditSummaryType = new GraphQLObjectType({ name: 'SeoAuditSummary', fields: { total: { type: new GraphQLNonNull(GraphQLInt) }, info: { type: new GraphQLNonNull(GraphQLInt) }, warning: { type: new GraphQLNonNull(GraphQLInt) }, error: { type: new GraphQLNonNull(GraphQLInt) }, critical: { type: new GraphQLNonNull(GraphQLInt) } } })
const AuditReportType = new GraphQLObjectType({ name: 'SeoAuditReport', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, id: { type: new GraphQLNonNull(GraphQLString) }, createdAt: { type: new GraphQLNonNull(GraphQLString) }, score: { type: new GraphQLNonNull(GraphQLInt) }, summary: { type: new GraphQLNonNull(AuditSummaryType) }, issues: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(AuditIssueType))) } } })
const RedirectDataType = new GraphQLObjectType({ name: 'SeoRedirectData', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, id: { type: new GraphQLNonNull(GraphQLString) }, site: { type: new GraphQLNonNull(GraphQLString) }, source: { type: new GraphQLNonNull(GraphQLString) }, destination: { type: new GraphQLNonNull(GraphQLString) }, status: { type: new GraphQLNonNull(GraphQLInt) }, enabled: { type: new GraphQLNonNull(GraphQLBoolean) } } })
const RedirectType = new GraphQLObjectType({ name: 'SeoRedirect', fields: { data: { type: new GraphQLNonNull(RedirectDataType) }, meta: { type: new GraphQLNonNull(DocumentMetaType) } } })
const DeleteResultType = new GraphQLObjectType({ name: 'SeoDeleteResult', fields: { deleted: { type: new GraphQLNonNull(GraphQLBoolean) } } })

const SourceInput = new GraphQLInputObjectType({ name: 'SeoSourceInput', fields: { kind: { type: new GraphQLNonNull(GraphQLString) }, value: { type: GraphQLString } } })
const RobotsInput = new GraphQLInputObjectType({ name: 'SeoRobotsInput', fields: { indexing: { type: GraphQLString }, following: { type: GraphQLString }, noarchive: { type: GraphQLBoolean }, noimageindex: { type: GraphQLBoolean }, nosnippet: { type: GraphQLBoolean } } })
const SocialInput = new GraphQLInputObjectType({ name: 'SeoSocialInput', fields: { image: { type: SourceInput }, imageAlt: { type: SourceInput }, twitterCard: { type: GraphQLString }, twitterSite: { type: GraphQLString }, twitterCreator: { type: GraphQLString } } })
const SitemapInput = new GraphQLInputObjectType({ name: 'SeoSitemapInput', fields: { enabled: { type: GraphQLBoolean }, priority: { type: GraphQLFloat }, changeFrequency: { type: GraphQLString } } })
const JsonLdInput = new GraphQLInputObjectType({ name: 'SeoJsonLdInput', fields: { enabled: { type: GraphQLBoolean }, type: { type: GraphQLString }, custom: { type: SeoJsonScalar } } })
const ValuesInput = new GraphQLInputObjectType({ name: 'SeoValuesInput', fields: { enabled: { type: GraphQLBoolean }, title: { type: SourceInput }, description: { type: SourceInput }, canonical: { type: SourceInput }, robots: { type: RobotsInput }, social: { type: SocialInput }, sitemap: { type: SitemapInput }, jsonLd: { type: JsonLdInput } } })
const SiteDocumentInput = new GraphQLInputObjectType({ name: 'SeoSiteDocumentInput', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, kind: { type: new GraphQLNonNull(GraphQLString) }, site: { type: new GraphQLNonNull(GraphQLString) }, seo: { type: new GraphQLNonNull(ValuesInput) } } })
const SectionDocumentInput = new GraphQLInputObjectType({ name: 'SeoSectionDocumentInput', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, kind: { type: new GraphQLNonNull(GraphQLString) }, section: { type: new GraphQLNonNull(GraphQLString) }, handle: { type: new GraphQLNonNull(GraphQLString) }, seo: { type: new GraphQLNonNull(ValuesInput) } } })
const RedirectInput = new GraphQLInputObjectType({ name: 'SeoRedirectInput', fields: { version: { type: new GraphQLNonNull(GraphQLInt) }, id: { type: new GraphQLNonNull(GraphQLString) }, site: { type: new GraphQLNonNull(GraphQLString) }, source: { type: new GraphQLNonNull(GraphQLString) }, destination: { type: new GraphQLNonNull(GraphQLString) }, status: { type: new GraphQLNonNull(GraphQLInt) }, enabled: { type: new GraphQLNonNull(GraphQLBoolean) } } })

function resolver(resolvers: Record<string, unknown>, name: string): GraphQLFieldResolver<unknown, unknown> | undefined {
  return resolvers[name] as GraphQLFieldResolver<unknown, unknown> | undefined
}

export function seoGraphQLQueryFields(resolvers: Record<string, unknown>): GraphQLFieldConfigMap<unknown, unknown> {
  const fields: GraphQLFieldConfigMap<unknown, unknown> = {}
  const add = (name: string, type: GraphQLObjectType | GraphQLList<GraphQLNonNull<GraphQLObjectType>>, args: Record<string, { type: unknown }>) => {
    const resolve = resolver(resolvers, name)
    if (resolve) fields[name] = { type, args: args as never, resolve }
  }
  add('seoSite', SiteDocumentType, { site: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoSection', SectionDocumentType, { section: { type: new GraphQLNonNull(GraphQLString) }, handle: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoResolved', ResolvedType, { site: { type: new GraphQLNonNull(GraphQLString) }, collection: { type: new GraphQLNonNull(GraphQLString) }, slug: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoPreview', PreviewType, { site: { type: new GraphQLNonNull(GraphQLString) }, collection: { type: new GraphQLNonNull(GraphQLString) }, slug: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoResolvedTerm', ResolvedType, { site: { type: new GraphQLNonNull(GraphQLString) }, taxonomy: { type: new GraphQLNonNull(GraphQLString) }, slug: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoPreviewTerm', PreviewType, { site: { type: new GraphQLNonNull(GraphQLString) }, taxonomy: { type: new GraphQLNonNull(GraphQLString) }, slug: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoReport', AuditReportType, { id: { type: GraphQLString }, site: { type: GraphQLString } })
  add('seoRedirect', RedirectType, { id: { type: new GraphQLNonNull(GraphQLString) } })
  add('seoRedirects', new GraphQLList(new GraphQLNonNull(RedirectType)), { site: { type: GraphQLString } })
  return fields
}

export function seoGraphQLMutationFields(resolvers: Record<string, unknown>): GraphQLFieldConfigMap<unknown, unknown> {
  const fields: GraphQLFieldConfigMap<unknown, unknown> = {}
  const add = (name: string, type: GraphQLObjectType, args: Record<string, { type: unknown }>) => {
    const resolve = resolver(resolvers, name)
    if (resolve) fields[name] = { type, args: args as never, resolve }
  }
  add('seoSaveSite', SiteDocumentType, { document: { type: new GraphQLNonNull(SiteDocumentInput) }, expectedRevision: { type: GraphQLString } })
  add('seoSaveSection', SectionDocumentType, { document: { type: new GraphQLNonNull(SectionDocumentInput) }, expectedRevision: { type: GraphQLString } })
  add('seoSaveRedirect', RedirectType, { redirect: { type: new GraphQLNonNull(RedirectInput) }, expectedRevision: { type: GraphQLString } })
  add('seoDeleteRedirect', DeleteResultType, { id: { type: new GraphQLNonNull(GraphQLString) }, expectedRevision: { type: GraphQLString } })
  return fields
}
