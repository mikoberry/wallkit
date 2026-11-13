// Optional namespaced storage helper.
//
// Components never touch localStorage themselves: a library that hard-codes
// key names collides as soon as two wallpapers run on the same origin. The
// caller owns the namespace and the schema; this helper only adds the version
// suffix and swallows the exceptions a locked-down browser may throw.

/**
 * Create a namespaced JSON store backed by localStorage.
 *
 * Keys are written as `<namespace>:<key>:v<version>`. A failing read or write
 * degrades to the fallback instead of throwing, because a wallpaper must keep
 * rendering even when storage is unavailable.
 *
 * @param {string} namespace  e.g. 'my-wallpaper'
 * @param {{ version?: number }} [options]
 */
export function createStore(namespace, { version = 1 } = {}) {
  const prefix = `${namespace}:`
  const suffix = `:v${version}`

  function storage() {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage ?? null
    } catch {
      // Access can throw when storage is disabled by policy.
      return null
    }
  }

  function fullKey(key) {
    return `${prefix}${key}${suffix}`
  }

  return {
    /**
     * Read a stored value.
     *
     * @param {string} key
     * @param {*} [fallback]
     */
    get(key, fallback = null) {
      const store = storage()
      if (!store) return fallback
      try {
        const raw = store.getItem(fullKey(key))
        if (raw === null) return fallback
        return JSON.parse(raw)
      } catch {
        return fallback
      }
    },

    /**
     * Write a value.
     *
     * @param {string} key
     * @param {*} value
     * @returns {boolean} whether the write succeeded
     */
    set(key, value) {
      const store = storage()
      if (!store) return false
      try {
        store.setItem(fullKey(key), JSON.stringify(value))
        return true
      } catch {
        return false
      }
    },

    /**
     * Remove a single key.
     *
     * @param {string} key
     */
    remove(key) {
      const store = storage()
      if (!store) return
      try {
        store.removeItem(fullKey(key))
      } catch {
        // Ignore: removing a key that cannot be removed is already the goal.
      }
    },
  }
}
