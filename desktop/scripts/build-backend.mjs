/**
 * esbuild bundling of the backend — backend/src -> desktop/build/backend.mjs (single-file ESM).
 *
 * - esm format: the backend's top-level await initDb() requires ESM.
 * - Four externals: sharp / better-sqlite3 (native modules rebuilt for the Electron ABI by
 *   electron-builder and unpacked via asarUnpack), ffmpeg-static / ffprobe-static (postinstall
 *   downloaded binaries, also loaded dynamically via createRequire in ffmpeg.ts, so they cannot be bundled statically).
 * - Banner injects createRequire: externals in the ESM output resolve via require to
 *   desktop/node_modules (a copy built against the same ABI as the main app).
 */
import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.resolve(__dirname, '../../backend/src/index.ts')],
  outfile: path.resolve(__dirname, '../build/backend.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external: ['sharp', 'better-sqlite3', 'ffmpeg-static', 'ffprobe-static'],
  banner: {
    // esbuild does not shim __dirname/__filename/require when bundling CJS into ESM (needed by fluent-ffmpeg and others),
    // so inject them at the top of the output; __dirname points at build/, affecting only unused relative paths such as presets
    js: [
      `import { createRequire as __hbCreateRequire } from 'module'`,
      `import __hbPath from 'path'`,
      `import { fileURLToPath as __hbFileURLToPath } from 'url'`,
      `const require = __hbCreateRequire(import.meta.url)`,
      // Use var: esbuild also emits var __filename for some CJS dependencies, and redeclaration is legal
      `var __filename = __hbFileURLToPath(import.meta.url)`,
      `var __dirname = __hbPath.dirname(__filename)`,
    ].join('\n'),
  },
  logLevel: 'info',
})
