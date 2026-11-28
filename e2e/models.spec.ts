import { expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

// A chat's own model, against the real Code Puppy. Nothing here changes the default model: that is the
// user's own Code Puppy setting (shared with the terminal), and a chat's own choice never writes to it.
const { page } = useApp()

const picker = () => page().getByRole('button', { name: /^Model:/ })
const shownName = async () => (await picker().getAttribute('aria-label'))!.replace(/^Model: /, '')
/** Picks the first model in the menu that is not one of `avoid`; resolves to its name. */
const chooseOther = async (...avoid: string[]) => {
  await picker().click()
  const options = page().getByRole('listbox', { name: 'Model' }).getByRole('option')
  const names = (await options.allInnerTexts()).map((text) => text.split('\n')[0])
  const name = names.find((candidate) => !avoid.includes(candidate))!
  await options.filter({ has: page().getByText(name, { exact: true }) }).first().click()
  await expect(picker()).toHaveAccessibleName(`Model: ${name}`)
  return name
}
const savedChats = () => page().evaluate(() => window.puppy.listSessions())

let defaultName = ''
let chosenName = ''

test("a model chosen in one chat stays in that chat: the next new chat starts on the default", async () => {
  await page().evaluate(() => window.puppy.updateSettings({ smartTitles: false })) // keep titles predictable
  await page().getByRole('button', { name: 'New chat' }).click()
  defaultName = await shownName()
  await sendAndWait(page(), 'Say only the word one.')
  chosenName = await chooseOther(defaultName)

  await page().getByRole('button', { name: 'New chat' }).click()
  await expect(picker()).toHaveAccessibleName(`Model: ${defaultName}`) // what used to show the other chat's model
  await sendAndWait(page(), 'Say only the word two.')
  await expect(picker()).toHaveAccessibleName(`Model: ${defaultName}`)
  await shot(page(), 'model-new-chat-default')

  await sidebar(page()).getByRole('button', { name: /Say only the word one/ }).first().click()
  await expect(picker()).toHaveAccessibleName(`Model: ${chosenName}`)
})

test('a reopened chat gets its own model back from Code Puppy; one that never chose is on the default', async () => {
  const reopened = await page().evaluate(async () => {
    const chats = await window.puppy.listSessions()
    const byTitle = (word: string) => chats.find((chat) => chat.title?.includes(word))!
    const [one, two] = [byTitle('one'), byTitle('two')]
    return [(await window.puppy.loadSession(one.sessionId, one.cwd)).model, (await window.puppy.loadSession(two.sessionId, two.cwd)).model]
  })
  const options = await page().evaluate(() => window.puppy.getConfigOptions())
  const list = options.find((option) => option.id === 'model')
  const valueOf = (name: string) => (list && 'options' in list ? (list.options as { value: string; name: string }[]).find((option) => option.name === name)?.value : undefined)
  expect(reopened).toEqual([valueOf(chosenName), null])
  expect((await savedChats()).length).toBeGreaterThanOrEqual(2)
})

test('choosing a model on the home screen is for the chat about to start only', async () => {
  await page().getByRole('button', { name: 'New chat' }).click()
  const forThisOne = await chooseOther(defaultName)
  await sendAndWait(page(), 'Say only the word three.')
  await expect(picker()).toHaveAccessibleName(`Model: ${forThisOne}`)
  await page().getByRole('button', { name: 'New chat' }).click()
  await expect(picker()).toHaveAccessibleName(`Model: ${defaultName}`)
})

test("putting a chat on a model that is neither of the two turns automatic switching off there, and says so", async () => {
  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  await page().getByRole('switch', { name: 'Switch models automatically' }).click()
  await expect(page().getByRole('button', { name: /^Main model:/ })).toHaveAccessibleName(`Main model: ${defaultName}`) // the default is the main model
  await page().getByRole('button', { name: /^Secondary model:/ }).click()
  const secondary = page().getByRole('listbox', { name: 'Secondary model' }).getByRole('option').first()
  const secondaryName = (await secondary.innerText()).split('\n')[0]
  await secondary.click()

  await page().getByRole('button', { name: 'Close settings' }).click()
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'Say only the word four.')
  const log = page().getByRole('log', { name: 'Conversation' })
  const third = await chooseOther(defaultName, secondaryName)
  await expect(log.getByRole('status').filter({ hasText: 'Automatic model switching is off in this chat' })).toContainText(`while it uses ${third}`)
  await shot(page(), 'model-switching-off-note')

  await picker().click()
  await page().getByRole('listbox', { name: 'Model' }).getByRole('option').filter({ has: page().getByText(defaultName, { exact: true }) }).first().click()
  await expect(log.getByRole('status').filter({ hasText: 'Automatic model switching is back on in this chat' })).toBeVisible()

  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  await page().getByRole('switch', { name: 'Switch models automatically' }).click() // leave it off, as the user found it
})
