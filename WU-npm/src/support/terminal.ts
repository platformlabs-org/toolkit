export function termSize(): { width: number; height: number } {
  const width = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80
  const height = process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : 24
  return { width, height }
}
