import * as v from 'valibot'

export const publicEnvSchema = v.object({
  PUBLIC_KEY: v.string(),
  VITE_API_URL: v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.string(),
})

export const privateEnvSchema = v.object({
  API_SECRET: v.string(),
  DATABASE_URL: v.pipe(v.string(), v.url()),
})

export type PublicEnv = v.InferOutput<typeof publicEnvSchema>
export type PrivateEnv = v.InferOutput<typeof privateEnvSchema>
