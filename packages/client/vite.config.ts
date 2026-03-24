import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const certPath = path.resolve(process.cwd(), '../../.certs/localhost.cert')
  const keyPath = path.resolve(process.cwd(), '../../.certs/localhost.key')
  const hasHttpsCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

  return {
    plugins: [solid(), tailwindcss()],
    optimizeDeps: {
      exclude: ['oxigraph']
    },
    server: {
      host: env.HOST || 'localhost',
      port: parseInt(env.PORT || '3000'),
      ...(hasHttpsCerts
        ? {
            https: {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath)
            }
          }
        : {})
    }
  }
})
