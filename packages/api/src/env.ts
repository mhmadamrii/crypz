// Read env dynamically: bundlers may inline static `process.env.X` references at build time.
export function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

export const optionalEnv = (name: string) => process.env[name] || undefined

export const isProd = () => process.env['NODE_ENV'] === 'production'
