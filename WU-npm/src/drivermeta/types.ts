export type Color = number // index into COLORS palette (0..9)

// 顺序沿用 Go：Cyan, Yellow, Green, Magenta, Blue, White, DarkCyan, DarkYellow, DarkGreen, DarkMagenta
export const COLORS: Color[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export interface HardwareTarget {
  bundleId: string
  bundleTag: string
  infId: string
  osCode: string
  pnpId: string
  manufacturer: string
  deviceDescription: string
}

export interface BundleLegend {
  bundleId: string
  tag: string
  color: Color
  itemCount: number
  sampleInfs: string[]
}

export interface BundleUIMapping {
  bundleColorById: Record<string, Color>
  bundleTagById: Record<string, string>
  legends: BundleLegend[]
}

export interface ParseResult {
  targets: HardwareTarget[]
  ui: BundleUIMapping
}
