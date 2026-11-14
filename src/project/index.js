// Build-time project.json tooling (`wallkit/project`).
//
// Nothing here is imported by a component, and nothing here runs inside the
// wallpaper: it exists so a repo can declare its manifest once instead of
// retyping the same title, link and settings every time.

export {
  ENGINE_OWNED,
  defineProject,
  mergeProject,
  diffProject,
  stringifyProject,
} from './project.js'

export {
  colorTriplet,
  color,
  bool,
  slider,
  combo,
  text,
  html,
  file,
  directory,
  group,
} from './properties.js'
