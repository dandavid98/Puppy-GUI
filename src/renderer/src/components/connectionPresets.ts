import type { ConnectionDraft } from '@shared/api'

/** The sign-in steps for ProductWatch, which keeps its login token only in the browser. */
const PRODUCTWATCH_STEPS = [
  '1. Sign in to ProductWatch in Chrome (VPN on). "Open page" below takes you there.',
  '2. Press Cmd+Option+J to open the console. If Chrome warns about pasting, type: allow pasting',
  '3. Paste this and press Return:',
  'const s = JSON.parse(localStorage.getItem("auth-storage")).state; console.log(`PW_TOKEN="${s.token}"\\nPW_EMAIL="${s.user.email}"`)',
  '4. Double-click set-pw-token.command in the scan-matcher folder and paste the two lines it prints.',
  '5. Come back here and press "Check again".',
].join('\n')

export const EMPTY_DRAFT: ConnectionDraft = {
  name: '',
  file: '',
  tokenVariable: '',
  accountVariable: '',
  expiry: { kind: 'token' },
  renewUrl: '',
  renewSteps: '',
}

/** Everything but the file, which only the user knows. */
export const PRODUCTWATCH_DRAFT: ConnectionDraft = {
  ...EMPTY_DRAFT,
  name: 'ProductWatch',
  tokenVariable: 'PW_TOKEN',
  accountVariable: 'PW_EMAIL',
  renewUrl: 'https://pw-prod-walter.rna-walmart.rna-data.com',
  renewSteps: PRODUCTWATCH_STEPS,
}
