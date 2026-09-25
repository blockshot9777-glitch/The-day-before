// ESLint: catches undefined names and dead code; run with `npm run lint`.
// Browser globals the game uses plus Node's for tools/ and tests/.
export default [{ ignores: ['node_modules/', 'vendor/', 'test-results/', '_*.html'] }, {
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { window: 'readonly', document: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly', localStorage: 'readonly', setTimeout: 'readonly', console: 'readonly', location: 'readonly', URLSearchParams: 'readonly', matchMedia: 'readonly', HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly', Event: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', Buffer: 'readonly' } },
  rules: { 'no-unused-vars': ['warn', { args: 'none' }], 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
}];
