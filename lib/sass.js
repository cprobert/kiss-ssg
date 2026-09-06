import * as sassModule from 'sass'

// Older sass releases (e.g. 1.52) expose the modern API only on the default
// export from ESM and newer ones export it by name (and deprecate `default`),
// so prefer the named export and fall back only when it is missing.
export default typeof sassModule.compile === 'function'
  ? sassModule
  : sassModule.default
