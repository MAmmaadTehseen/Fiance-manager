// Metro in an npm workspace.
//
// Two things are needed and neither is the default: Metro must watch the repo
// root so changes in packages/core trigger a reload, and it must be told to
// look in both node_modules folders. Hierarchical lookup is disabled so a
// package hoisted to the root cannot be resolved twice — two copies of React
// in one bundle is the classic monorepo failure, and it surfaces as
// "invalid hook call" rather than as a resolution error.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true

module.exports = config
