import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

interface PipSubtitleData {
  subContent: string
  fonts: Array<{ name: string; data: number[] }>
  availableFonts: Record<string, string>
}

interface PipShowOptions {
  src: string
  startTime?: number
  position?: string
  width?: number
  height?: number
  subtitle?: PipSubtitleData | null
}

interface PendingData {
  src: string
  subtitle: PipSubtitleData | null
  autoPlay: boolean
  startTime: number
}

class PipManager {
  private window: BrowserWindow | null = null
  private lastTime = 0
  private timeTimer: ReturnType<typeof setInterval> | null = null
  private ready = false
  private mainWindow: BrowserWindow | null = null
  private loadedSrc: string | null = null
  private pendingData: PendingData | null = null

  private static normalizeFilePath(url: string): string {
    try {
      const decoded = decodeURIComponent(url)
      const match = decoded.match(/^file:\/\/\/?(.+)/i)
      return match ? match[1].replace(/\//g, '\\').toLowerCase() : decoded.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  init(): void {
    console.log('[PiP][manager] init -> creating hidden window')
    this.createWindow()
    this.registerIpc()
  }

  private createWindow(): void {
    console.log('[PiP][manager] createWindow')
    this.window = new BrowserWindow({
      width: 480,
      height: 290,
      minWidth: 180,
      minHeight: 110,
      show: false,
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

    this.window.on('closed', () => {
      console.warn('[PiP][manager] window CLOSED -> should not happen during normal use')
      this.window = null
      this.ready = false
      this.loadedSrc = null
      this.stopTimeTracking()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/pip.html`)
    } else {
      this.window.loadFile(join(__dirname, '../renderer/pip.html'))
    }

    this.window.webContents.on('did-finish-load', () => {
      console.log('[PiP][manager] did-finish-load -> ready=true')
      this.ready = true
      if (this.pendingData) {
        const pd = this.pendingData
        this.pendingData = null
        console.log(
          '[PiP][manager] did-finish-load -> flushing pending, autoPlay:',
          pd.autoPlay
        )
        this.sendVideoSrc(pd.src, pd.subtitle, 0)
        if (pd.autoPlay) {
          this.sendPlay(pd.startTime)
          this.startTimeTracking()
        }
      }
    })
  }

  private registerIpc(): void {
    ipcMain.on('pip:hidden', () => {
      console.log('[PiP][manager] received pip:hidden -> hiding window')
      this.hide()
      this.notifyClosed()
    })

    ipcMain.on('pip:timeUpdate', (_event, time: number) => {
      this.lastTime = time || 0
    })

    ipcMain.on('pip:ended', () => {
      console.log('[PiP][manager] received pip:ended -> video finished')
      this.stopTimeTracking()
      this.loadedSrc = null
      this.mainWindow?.webContents.send('pip:ended')
    })
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (!this.window || this.window.isDestroyed()) {
      console.warn('[PiP][manager] sendToRenderer -> window null or destroyed, channel:', channel)
      return
    }
    this.window.webContents.send(channel, ...args)
  }

  private sendPlay(startTime: number): void {
    console.log('[PiP][manager] sendPlay -> startTime:', startTime)
    this.sendToRenderer('pip:play', startTime)
  }

  private notifyClosed(): void {
    const time = this.lastTime
    console.log('[PiP][manager] notifyClosed -> time:', time)
    this.mainWindow?.webContents.send('pip:closed', time)
  }

  private startTimeTracking(): void {
    this.stopTimeTracking()
    this.timeTimer = setInterval(() => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('pip:requestTime')
      }
    }, 500)
  }

  private stopTimeTracking(): void {
    if (this.timeTimer) {
      clearInterval(this.timeTimer)
      this.timeTimer = null
    }
  }

  private ensureWindow(): BrowserWindow {
    if (!this.window || this.window.isDestroyed()) {
      this.ready = false
      this.loadedSrc = null
      this.createWindow()
    }
    return this.window!
  }

  private positionWindow(opts: { position?: string; width?: number; height?: number }): {
    x: number
    y: number
    width: number
    height: number
  } {
    const pw = opts.width || 480
    const ph = opts.height || 290
    const pos = opts.position || 'bottom-right'
    const display = screen.getPrimaryDisplay().workAreaSize
    const margin = 20
    let x: number, y: number

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

    return { x, y, width: pw, height: ph }
  }

  private sendVideoSrc(
    src: string,
    subtitle: PipSubtitleData | null | undefined,
    startTime: number
  ): void {
    if (!this.window || this.window.isDestroyed()) {
      console.warn('[PiP][manager] sendVideoSrc -> window null, abort')
      return
    }
    console.log('[PiP][manager] sendVideoSrc -> src:', src.substring(0, 80), 'start:', startTime)
    this.window.webContents.send('pip:videoSrc', { src, start: startTime || 0 })
    this.loadedSrc = src

    if (subtitle && subtitle.subContent) {
      console.log('[PiP][manager] sendVideoSrc -> subtitle length:', subtitle.subContent.length)
      this.window.webContents.send('pip:subtitle', subtitle)
    } else if (subtitle !== undefined) {
      console.log('[PiP][manager] sendVideoSrc -> no subtitle, clearing')
      this.window.webContents.send('pip:clearSubtitle')
    }
  }

  preload(src: string, subtitleData: PipSubtitleData | null): void {
    this.ensureWindow()
    console.log(`[PiP][manager] preload -> src: ${src.substring(0, 100)} (ready: ${this.ready})`)

    if (this.ready) {
      this.sendVideoSrc(src, subtitleData, 0)
      console.log(`[PiP][manager] preload -> loadedSrc now: ${this.loadedSrc?.substring(0, 100)}`)
    } else {
      console.log('[PiP][manager] preload -> not ready, buffering')
      this.pendingData = { src, subtitle: subtitleData, autoPlay: false, startTime: 0 }
    }
  }

  show(options: PipShowOptions): boolean {
    console.log(`[PiP][manager] show -> startTime: ${options.startTime} (${new Date().toISOString()})`)
    const win = this.ensureWindow()

    const bounds = this.positionWindow(options)
    win.setBounds(bounds)
    win.show()
    win.focus()

    this.lastTime = options.startTime || 0

    if (this.ready) {
      const loaded = this.loadedSrc ? PipManager.normalizeFilePath(this.loadedSrc) : null
      const requested = options.src ? PipManager.normalizeFilePath(options.src) : null
      console.log(`[PiP][manager] show -> loadedSrc: ${this.loadedSrc?.substring(0, 100) || 'null'}`)
      console.log(`[PiP][manager] show -> loaded norm: ${loaded || 'null'}`)
      console.log(`[PiP][manager] show -> requested norm: ${requested || 'null'}`)
      console.log(`[PiP][manager] show -> match: ${loaded && requested && loaded === requested}`)
      if (loaded && requested && loaded === requested) {
        console.log(`[PiP][manager] show -> already preloaded, JUST PLAYING at ${options.startTime}`)
        this.sendPlay(options.startTime || 0)
        this.startTimeTracking()
      } else {
        console.log(`[PiP][manager] show -> fresh load, sending VIDEO + SUBTITLE + PLAY`)
        this.sendVideoSrc(options.src, options.subtitle, options.startTime || 0)
        this.sendPlay(options.startTime || 0)
        this.startTimeTracking()
      }
    } else {
      this.pendingData = {
        src: options.src,
        subtitle: options.subtitle || null,
        autoPlay: true,
        startTime: options.startTime || 0
      }
    }

    return true
  }

  loadTrack(src: string, subtitleData: PipSubtitleData | null): void {
    this.ensureWindow()
    console.log('[PiP][manager] loadTrack -> src:', src.substring(0, 80))

    if (this.ready) {
      this.lastTime = 0
      this.sendVideoSrc(src, subtitleData, 0)
      this.sendPlay(0)
      this.startTimeTracking()
    } else {
      this.pendingData = { src, subtitle: subtitleData, autoPlay: true, startTime: 0 }
    }
  }

  play(startTime: number): void {
    console.log('[PiP][manager] play -> startTime:', startTime)
    this.lastTime = startTime
    this.sendPlay(startTime)
    this.startTimeTracking()
  }

  hide(): void {
    console.log('[PiP][manager] hide')
    this.stopTimeTracking()
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:pause')
      this.window.hide()
      console.log('[PiP][manager] hide -> window hidden, video paused (NOT cleared), loadedSrc preserved')
    }
  }

  stop(): void {
    console.log('[PiP][manager] stop')
    this.stopTimeTracking()
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('pip:clear')
      this.window.hide()
      this.loadedSrc = null
      console.log('[PiP][manager] stop -> window hidden + cleared + loadedSrc reset')
    }
    this.notifyClosed()
  }

  updateSubtitle(data: PipSubtitleData | null): void {
    if (!this.window || this.window.isDestroyed()) return
    if (data && data.subContent) {
      console.log('[PiP][manager] updateSubtitle -> subContent length:', data.subContent.length)
      this.window.webContents.send('pip:subtitle', data)
    } else {
      console.log('[PiP][manager] updateSubtitle -> clearing')
      this.window.webContents.send('pip:clearSubtitle')
    }
  }

  getTime(): number {
    return this.lastTime
  }

  isShowing(): boolean {
    return !!this.window && !this.window.isDestroyed() && this.window.isVisible()
  }

  destroy(): void {
    console.log('[PiP][manager] destroy -> cleaning up')
    this.stopTimeTracking()
    if (this.window && !this.window.isDestroyed()) {
      console.log('[PiP][manager] destroy -> destroying window')
      this.window.destroy()
    }
    this.window = null
    this.ready = false
    this.loadedSrc = null
  }
}

export const pipManager = new PipManager()
