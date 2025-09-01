import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

const production = !process.env.ROLLUP_WATCH;

export default defineConfig([
  // Main library build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/sortable.esm.js',
        format: 'es',
        sourcemap: true,
      },
      {
        file: 'dist/sortable.cjs.js',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/sortable.umd.js',
        format: 'umd',
        name: 'Sortable',
        sourcemap: true,
        exports: 'named',
      },
    ],
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false, // Handled separately
      }),
      production && terser(),
    ].filter(Boolean),
  },

  // Type definitions build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/types/index.d.ts',
      format: 'es',
    },
    plugins: [
      dts({
        tsconfig: './tsconfig.build.json',
      }),
    ],
  },
]);
