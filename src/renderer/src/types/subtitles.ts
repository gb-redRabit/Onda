export interface MkvFont {
  name: string
  ext: string
  data: number[]
}

export interface SubtitleTrack {
  id: string
  label: string
  language: string
  format: 'ass' | 'srt' | 'vtt' | 'ssa' | 'sub'
  source: 'embedded' | 'external'
  filePath?: string
  content?: string
  fonts?: MkvFont[]
}

export interface SubtitleSettings {
  fontSize: number
  fontName: string
  opacity: number
  textColor: string
  bgColor: string
  position: 'bottom' | 'center' | 'top'
  margin: number
  bold: boolean
  italic: boolean
}
