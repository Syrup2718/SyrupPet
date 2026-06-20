import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: {
          pet: resolve(__dirname, 'src/renderer/pet/index.html'),
          chat: resolve(__dirname, 'src/renderer/chat/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html'),
          tasks: resolve(__dirname, 'src/renderer/tasks/index.html')
        }
      }
    }
  }
})
