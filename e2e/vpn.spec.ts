import { expect, shot, test, useApp } from './fixtures'

// Nothing listens on port 443 of the loopback address, so Puppy believes it is off the VPN, wherever the test runs.
const { page } = useApp({ PUPPY_DESKTOP_VPN_HOST: '127.0.0.1' })

test('off the VPN, a banner says so instead of leaving Puppy sniffing forever', async () => {
  const banner = page().getByRole('alert').filter({ hasText: "You're not connected to the VPN" })
  await expect(banner).toBeVisible()
  await shot(page(), '09-off-vpn')

  // Still off: asking again keeps the warning up.
  await banner.getByRole('button', { name: 'Check again' }).click()
  await expect(banner).toBeVisible()
  expect(await page().evaluate(() => window.puppy.getVpnStatus())).toBe('disconnected')
})
