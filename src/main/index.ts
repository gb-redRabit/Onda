import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIPC } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pipWindow: BrowserWindow | null = null
let pipLastTime: number = 0
let pipTimer: ReturnType<typeof setInterval> | null = null
let pipClosing = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('maximize', () => {
    win.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win.webContents.send('window:maximized', false)
  })

  win.on('close', (e) => {
    if (tray) {
      e.preventDefault()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createChildWindow(
  parent: BrowserWindow,
  options: { title: string; width: number; height: number; alwaysOnTop?: boolean }
): BrowserWindow {
  const child = new BrowserWindow({
    parent,
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: options.alwaysOnTop ?? true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  child.on('ready-to-show', () => {
    child.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    child.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/player')
  } else {
    child.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player' })
  }

  return child
}

function setupTray(): void {
  if (!icon) return
  tray = new Tray(icon)
  tray.setToolTip('Onda Player')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Play / Pause', click: () => mainWindow?.webContents.send('media:playPause') },
    { label: 'Next', click: () => mainWindow?.webContents.send('media:next') },
    { label: 'Previous', click: () => mainWindow?.webContents.send('media:previous') },
    { type: 'separator' },
    {
      label: 'Show Onda',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerGlobalShortcuts(): void {
  const shortcuts: Record<string, () => void> = {
    MediaPlayPause: () => mainWindow?.webContents.send('media:playPause'),
    MediaNextTrack: () => mainWindow?.webContents.send('media:next'),
    MediaPreviousTrack: () => mainWindow?.webContents.send('media:previous'),
    MediaStop: () => mainWindow?.webContents.send('media:stop'),
    VolumeUp: () => mainWindow?.webContents.send('media:volumeUp'),
    VolumeDown: () => mainWindow?.webContents.send('media:volumeDown'),
    VolumeMute: () => mainWindow?.webContents.send('media:toggleMute')
  }

  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    try {
      globalShortcut.register(accelerator, handler)
    } catch {
      // Some shortcuts may not be available on all platforms
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.onda.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()
  mainWindow = createWindow()
  setupTray()
  registerGlobalShortcuts()

  ipcMain.handle(
    'window:createChild',
    (_event, options: { title: string; width: number; height: number; alwaysOnTop?: boolean }) => {
      if (!mainWindow) return null
      const child = createChildWindow(mainWindow, options)
      return child.id
    }
  )

  ipcMain.handle('window:closeChild', (_event, childId: number) => {
    const child = BrowserWindow.fromId(childId)
    child?.close()
  })

  ipcMain.handle(
    'pip:start',
    (
      _event,
      videoSrc: string,
      pipSettings?: { position?: string; width?: number; height?: number; startTime?: number }
    ) => {
      if (pipWindow && !pipWindow.isDestroyed()) {
        if (pipTimer) {
          clearInterval(pipTimer)
          pipTimer = null
        }
        pipClosing = true
        pipWindow.destroy()
        pipWindow = null
      }
      if (!mainWindow) return false

      const pw = pipSettings?.width || 480
      const ph = pipSettings?.height || 290
      const pos = pipSettings?.position || 'bottom-right'
      const startTime = pipSettings?.startTime || 0
      const display = screen.getPrimaryDisplay().workAreaSize
      let x: number, y: number
      const margin = 20
      switch (pos) {
        case 'bottom-left':
          x = margin
          y = display.height - ph - margin
          break
        case 'top-right':
          x = display.width - pw - margin
          y = margin
          break
        case 'top-left':
          x = margin
          y = margin
          break
        default:
          x = display.width - pw - margin
          y = display.height - ph - margin
          break
      }

      const pwWin = new BrowserWindow({
        x,
        y,
        width: pw,
        height: ph,
        minWidth: 180,
        minHeight: 110,
        alwaysOnTop: true,
        frame: false,
        skipTaskbar: true,
        resizable: true,
        backgroundColor: '#000000',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false
        }
      })
      pipWindow = pwWin

      const html = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000;height:100%;overflow:hidden;font-family:sans-serif}
#wrap{position:relative;width:100%;height:100%;display:flex;flex-direction:column}
#pipV{flex:1;width:100%;object-fit:contain;background:#000}
#close{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:12px;background:rgba(0,0,0,0.6);border:none;color:#aaa;font:12px sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;transition:all .15s;opacity:0}
#close:hover{background:rgba(229,62,62,0.9);color:#fff}
#barW{height:4px;background:rgba(255,255,255,0.15);cursor:pointer;flex-shrink:0}
#barF{height:100%;background:#7c6aef;width:0%;pointer-events:none;border-radius:0 2px 2px 0}
#curT{position:absolute;bottom:8px;left:8px;font:10px monospace;color:rgba(255,255,255,0.5);pointer-events:none}
#durT{position:absolute;bottom:8px;right:8px;font:10px monospace;color:rgba(255,255,255,0.5);pointer-events:none}
</style></head><body>
<div id="wrap">
  <video id="pipV" preload="auto"></video>
  <button id="close">&#x2715;</button>
  <span id="curT">0:00</span>
  <span id="durT">0:00</span>
  <div id="barW"><div id="barF"></div></div>
</div>
<script>
var v=document.getElementById('pipV');
var barF=document.getElementById('barF');
var barW=document.getElementById('barW');
var curT=document.getElementById('curT');
var durT=document.getElementById('durT');
var fmt=function(t){if(!t||!isFinite(t))return'0:00';var m=Math.floor(t/60),s=Math.floor(t%60);return m+':'+(s<10?'0':'')+s;};

v.onloadedmetadata=function(){
  durT.textContent=fmt(v.duration);
  if(!window.__seeked){
    window.__seeked=true;
    v.currentTime=${startTime};
  }
  v.play().catch(function(){});
};
v.ontimeupdate=function(){
  barF.style.width=(v.duration?(v.currentTime/v.duration*100):0)+'%';
  curT.textContent=fmt(v.currentTime);
};
barW.onclick=function(e){
  var r=barW.getBoundingClientRect();
  v.currentTime=((e.clientX-r.left)/r.width)*v.duration;
};
document.getElementById('close').onmouseover=function(){this.style.background='rgba(229,62,62,0.9)';this.style.color='#fff';};
document.getElementById('close').onmouseout=function(){this.style.background='rgba(0,0,0,0.6)';this.style.color='#aaa';};
document.getElementById('close').onclick=function(){
  window.close();
};
var wrap=document.getElementById('wrap');
wrap.onmouseenter=function(){document.getElementById('close').style.opacity='1';};
wrap.onmouseleave=function(){document.getElementById('close').style.opacity='0';};
v.src=${JSON.stringify(videoSrc)};
</script></body></html>`

      pwWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

      pipLastTime = startTime
      if (pipTimer) clearInterval(pipTimer)
      pipTimer = setInterval(() => {
        if (pipWindow && !pipWindow.isDestroyed()) {
          pipWindow.webContents
            .executeJavaScript(
              'document.getElementById("pipV") ? document.getElementById("pipV").currentTime : 0'
            )
            .then((t) => {
              pipLastTime = (t as number) || 0
            })
            .catch(() => {})
        }
      }, 500)

      pwWin.on('closed', () => {
        if (pipTimer) {
          clearInterval(pipTimer)
          pipTimer = null
        }
        if (pipClosing) {
          pipClosing = false
          pipWindow = null
          return
        }
        const time = pipLastTime
        pipWindow = null
        mainWindow?.webContents.send('pip:closed', time)
      })
      return true
    }
  )

  ipcMain.handle('pip:stop', () => {
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.webContents
        .executeJavaScript(
          'document.getElementById("pipV") ? document.getElementById("pipV").currentTime : 0'
        )
        .then((t) => {
          pipLastTime = (t as number) || 0
        })
        .catch(() => {})
        .finally(() => {
          if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close()
        })
    }
    return true
  })

  ipcMain.handle('pip:updatesrc', (_event, videoSrc: string) => {
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.webContents
        .executeJavaScript(
          `
        var v=document.getElementById('pipV');
        if(v){v.src=${JSON.stringify(videoSrc)};v.currentTime=0;v.play().catch(function(){});}
      `
        )
        .catch(() => {})
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
