import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      'out/**',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      // Vendored agent tooling (`.agents/`, `.claude/`, `.uizze/`) and Netlify's local state —
      // not project code, so their warnings would only bury the project's own.
      '.agents/**',
      '.claude/**',
      '.uizze/**',
      '.netlify/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
