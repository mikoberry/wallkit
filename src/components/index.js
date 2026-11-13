// Component entry points.
//
// Deep imports (`wallkit/components/clock`) are the primary path so a consumer
// only pulls in what it renders. This barrel is a convenience for projects
// that want several widgets at once.

export { Clock } from './clock/index.js'
export { Spectrum } from './spectrum/index.js'
