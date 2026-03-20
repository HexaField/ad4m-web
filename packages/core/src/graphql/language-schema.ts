import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLList
} from 'graphql'
import type { LanguageManager } from '../language/manager'
import type { LanguagePublisher } from '../language/publication'
import type { LanguageMetaInput } from '../language/registry-types'
import { readFileSync } from 'fs'

const IconType = new GraphQLObjectType({
  name: 'Icon',
  fields: {
    code: { type: new GraphQLNonNull(GraphQLString) }
  }
})

export const LanguageHandleType = new GraphQLObjectType({
  name: 'LanguageHandle',
  fields: {
    address: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    settings: { type: GraphQLString },
    icon: { type: IconType },
    constructorIcon: { type: IconType },
    settingsIcon: { type: IconType }
  }
})

export const LanguageMetaType = new GraphQLObjectType({
  name: 'LanguageMeta',
  fields: {
    name: { type: new GraphQLNonNull(GraphQLString) },
    address: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: GraphQLString },
    author: { type: GraphQLString },
    templated: { type: GraphQLBoolean },
    templateSourceLanguageAddress: { type: GraphQLString },
    templateAppliedParams: { type: GraphQLString },
    possibleTemplateParams: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
    sourceCodeHash: { type: GraphQLString }
  }
})

const LanguageMetaInputType = new GraphQLInputObjectType({
  name: 'LanguageMetaInput',
  fields: {
    name: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: GraphQLString },
    possibleTemplateParams: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) }
  }
})

export interface LanguageSchemaContext {
  languageManager: LanguageManager
  publisher: LanguagePublisher
  agentDid?: string
}

export function createLanguageQueryFields(ctx: LanguageSchemaContext) {
  return {
    language: {
      type: new GraphQLNonNull(LanguageHandleType),
      args: { address: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: (_: unknown, args: { address: string }) => {
        const handles = ctx.languageManager.listLanguages()
        const found = handles.find((h) => h.address === args.address)
        if (!found) throw new Error(`Language not found: "${args.address}"`)
        return found
      }
    },
    languageMeta: {
      type: new GraphQLNonNull(LanguageMetaType),
      args: { address: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: (_: unknown, args: { address: string }) => {
        const meta = ctx.languageManager.getMeta(args.address)
        if (!meta) throw new Error(`Language meta not found: "${args.address}"`)
        return meta
      }
    },
    languages: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LanguageHandleType))),
      args: { filter: { type: GraphQLString } },
      resolve: (_: unknown, args: { filter?: string }) => ctx.languageManager.listLanguages(args.filter)
    },
    languageSource: {
      type: new GraphQLNonNull(GraphQLString),
      args: { address: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: (_: unknown, args: { address: string }) => ctx.languageManager.getLanguageSource(args.address)
    }
  }
}

export function createLanguageMutationFields(ctx: LanguageSchemaContext) {
  return {
    languagePublish: {
      type: new GraphQLNonNull(LanguageMetaType),
      args: {
        languagePath: { type: new GraphQLNonNull(GraphQLString) },
        languageMeta: { type: new GraphQLNonNull(LanguageMetaInputType) }
      },
      resolve: (_: unknown, args: { languagePath: string; languageMeta: LanguageMetaInput }) => {
        const bundleContent = readFileSync(args.languagePath, 'utf-8')
        return ctx.publisher.publishLanguage(bundleContent, args.languageMeta, ctx.agentDid ?? 'unknown')
      }
    },
    languageRemove: {
      type: new GraphQLNonNull(GraphQLBoolean),
      args: { address: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: (_: unknown, args: { address: string }) => ctx.languageManager.removeLanguage(args.address)
    },
    languageWriteSettings: {
      type: new GraphQLNonNull(GraphQLBoolean),
      args: {
        languageAddress: { type: new GraphQLNonNull(GraphQLString) },
        settings: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: (_: unknown, args: { languageAddress: string; settings: string }) =>
        ctx.languageManager.writeSettings(args.languageAddress, args.settings)
    }
  }
}
