import path from 'node:path'
export {
  default,
  utils,
  renderRedirects,
  renderRedirectsJson,
  renderFirebaseRedirects,
  renderVercelRedirects,
  renderHtaccessRedirects,
} from '../../lib/kiss.js'
export const ENTRY = path.resolve('lib/kiss.js')
