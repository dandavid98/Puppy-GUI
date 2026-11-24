import { expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

const { page } = useApp()

/** A conversation's own button (not its "..." menu, which also mentions the title). */
const row = (title: string) => sidebar(page()).locator('li > button').filter({ hasText: title })
const section = (name: string) => sidebar(page()).getByRole('region', { name })
const folderToggle = (name: string) => sidebar(page()).locator('li > div > button[aria-expanded]').filter({ hasText: name })
const folderContents = (name: string) => page().getByRole('list', { name: `${name} conversations` })

async function chooseFromMenu(trigger: string, item: string) {
  await page().getByRole('button', { name: trigger }).click()
  await page().getByRole('menuitem', { name: item, exact: true }).click()
}

async function chooseFromRowMenu(title: string, item: string) {
  await row(title).hover()
  await chooseFromMenu(`Options for ${title}`, item)
}

async function newFolder(name: string) {
  await sidebar(page()).getByRole('button', { name: 'New folder' }).click()
  await page().getByLabel('Folder name').fill(name)
  await page().keyboard.press('Enter')
  await expect(folderToggle(name)).toBeVisible()
}

/** Give the newest conversation a fixed name, so smart titles cannot rename it under us. */
async function renameNewest(title: string) {
  const newest = sidebar(page()).locator('li').first()
  await newest.hover()
  await newest.getByRole('button', { name: /^Options for/ }).click()
  await page().getByRole('menuitem', { name: 'Rename', exact: true }).click()
  await page().getByLabel('Conversation title').fill(title)
  await page().keyboard.press('Enter')
  await expect(row(title)).toBeVisible()
}

test('set up: two chats to organize', async () => {
  await sendAndWait(page(), 'Reply with exactly one word: alpha')
  await renameNewest('Alpha chat')
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'Reply with exactly one word: beta')
  await renameNewest('Beta chat')
  await expect(sidebar(page()).locator('li > button').first()).toContainText('Beta chat') // newest first
})

test('pinning lifts a chat to the top, unpinning puts it back', async () => {
  await chooseFromRowMenu('Alpha chat', 'Pin')
  await expect(section('Pinned').getByText('Alpha chat')).toBeVisible()
  await expect(section('Pinned').getByText('Beta chat')).toHaveCount(0)
  await expect(sidebar(page()).locator('li > button').first()).toContainText('Alpha chat') // above the newer Beta chat
  await expect(row('Alpha chat')).toContainText('Pinned:') // announced to screen readers too

  await chooseFromRowMenu('Alpha chat', 'Unpin')
  await expect(section('Pinned')).toHaveCount(0)
  await expect(sidebar(page()).locator('li > button').first()).toContainText('Beta chat')
})

test('a folder is made by name, and files a chat away from the main list', async () => {
  await newFolder('Recipes')
  await expect(folderContents('Recipes')).toContainText('Empty')

  await chooseFromRowMenu('Beta chat', 'Move to Recipes')
  await expect(folderContents('Recipes').getByText('Beta chat')).toBeVisible()
  await expect(sidebar(page()).getByRole('region', { name: /^(Today|Yesterday)/ }).getByText('Beta chat')).toHaveCount(0)
  await expect(folderContents('Recipes')).not.toContainText('Empty')
})

test('a folder opens and closes, and remembers that after a reload', async () => {
  await folderToggle('Recipes').click()
  await expect(folderToggle('Recipes')).toHaveAttribute('aria-expanded', 'false')
  await expect(row('Beta chat')).toHaveCount(0)

  await page().reload()
  await expect(folderToggle('Recipes')).toHaveAttribute('aria-expanded', 'false') // came back from disk, not memory
  await folderToggle('Recipes').click()
  await expect(row('Beta chat')).toBeVisible()
})

test('"Move to new folder" makes the folder and files the chat in one go; pinned folders sort first', async () => {
  await chooseFromRowMenu('Alpha chat', 'Move to new folder...')
  await page().getByLabel('Folder name').fill('Archive')
  await page().keyboard.press('Enter')
  await expect(folderContents('Archive').getByText('Alpha chat')).toBeVisible()

  const toggles = sidebar(page()).locator('li > div > button[aria-expanded]')
  await expect(toggles.first()).toContainText('Archive') // alphabetical: Archive before Recipes
  await chooseFromMenu('Options for folder Recipes', 'Pin folder')
  await expect(toggles.first()).toContainText('Recipes') // pinned folders come first
  await expect(toggles.first()).toContainText('pinned')
  await shot(page(), '18-folders')
})

test('a pin inside a folder stays inside it', async () => {
  await chooseFromRowMenu('Alpha chat', 'Pin')
  await expect(section('Pinned')).toHaveCount(0)
  await expect(folderContents('Archive').getByText('Alpha chat')).toBeVisible()
  await chooseFromRowMenu('Alpha chat', 'Unpin')
})

test('a duplicate folder name is explained, and what you typed is kept', async () => {
  await sidebar(page()).getByRole('button', { name: 'New folder' }).click()
  await page().getByLabel('Folder name').fill('recipes')
  await page().keyboard.press('Enter')
  await expect(page().getByText('You already have a folder called "recipes".')).toBeVisible()
  await expect(page().getByLabel('Folder name')).toHaveValue('recipes')
  await page().keyboard.press('Escape')
  await expect(page().getByLabel('Folder name')).toHaveCount(0)
})

test('a folder can be renamed', async () => {
  await chooseFromMenu('Options for folder Archive', 'Rename folder')
  await page().getByLabel('Folder name').fill('Old stuff')
  await page().keyboard.press('Enter')
  await expect(folderToggle('Old stuff')).toBeVisible()
  await expect(folderContents('Old stuff').getByText('Alpha chat')).toBeVisible()
})

test('deleting a folder keeps its chats', async () => {
  await chooseFromMenu('Options for folder Recipes', 'Delete folder')
  await expect(page().getByText(/The folder "Recipes" will be deleted. Its conversation is kept/)).toBeVisible()
  await page().getByRole('button', { name: 'Delete folder', exact: true }).click()

  await expect(folderToggle('Recipes')).toHaveCount(0)
  await expect(row('Beta chat')).toBeVisible() // back in the main list
  await expect(folderContents('Old stuff').getByText('Alpha chat')).toBeVisible() // the other folder is untouched
})

test('folders belong to their tab: the Code tab does not show chat folders', async () => {
  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page().getByText('No code sessions yet.')).toBeVisible()
  await expect(folderToggle('Old stuff')).toHaveCount(0)
  await page().getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(folderToggle('Old stuff')).toBeVisible()
})
