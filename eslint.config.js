import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'src-tauri/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // sim 계층은 순수 TS — 렌더링·DOM·오디오 의존 금지 (CLAUDE.md 8절)
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'sim 계층은 Three.js를 import할 수 없습니다.' },
            { group: ['postprocessing', 'lil-gui', 'stats.js', '@dimforge/*', 'recast-navigation*'], message: 'sim 계층은 순수 TS여야 합니다.' },
            { group: ['**/presentation/**', '**/world/**', '**/debug/**', '**/npc/**', '**/gameplay/**'], message: 'sim은 상위 계층을 import할 수 없습니다.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'AudioContext', 'navigator'],
    },
  },
);
