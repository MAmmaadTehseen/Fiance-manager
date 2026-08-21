// Metro in an npm workspace.
//
// Only watchFolders is set. expo/metro-config already resolves workspace
// packages correctly, and overriding nodeModulesPaths or
// disableHierarchicalLookup fights it — `expo-doctor` flags both, and the
// second one in particular can produce duplicate copies of a native module
// rather than prevent them.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// So an edit in packages/core reloads the app.
config.watchFolders = [workspaceRoot]

module.exports = config
