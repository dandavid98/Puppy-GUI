// Run with Electron (it has a real renderer, so transparent corners come out right):
//   electron scripts/render-icon.cjs build/icon.svg build/icon.png
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')

const [svgPath, pngPath] = process.argv.slice(2)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true })
  const svg = readFileSync(svgPath, 'utf8')
  const html = `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(pngPath, image.toPNG())
  app.quit()
})
