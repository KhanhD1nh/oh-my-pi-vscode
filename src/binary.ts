/** Locate an installed omp, or download the official release once and verify its checksum. */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

const RELEASES = 'https://github.com/can1357/oh-my-pi/releases/latest/download'

/**
 * Release asset name for this platform.
 * @param platform - `process.platform`.
 * @param arch - `process.arch`.
 * @returns the asset file name, or undefined when omp ships no build.
 */
export function assetName(platform: string, arch: string): string | undefined {
  const cpu = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : undefined
  if (cpu === undefined) return undefined
  if (platform === 'win32') return `omp-windows-${cpu}.exe`
  if (platform === 'darwin') return `omp-darwin-${cpu}`
  if (platform === 'linux') return `omp-linux-${cpu}`
  return undefined
}

/** Where a downloaded omp lives; also searched first on later launches. */
export function installDir(env: NodeJS.ProcessEnv = process.env): string {
  return process.platform === 'win32'
    ? join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'oh-my-pi', 'bin')
    : join(homedir(), '.local', 'share', 'oh-my-pi', 'bin')
}

/**
 * First existing omp among PATH entries and the usual install locations.
 * @param command - configured command name or absolute path.
 * @param env - environment whose PATH is searched.
 * @returns an absolute executable path, or undefined.
 */
export function findOmp(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (isAbsolute(command)) return existsSync(command) ? command : undefined
  const exe = process.platform === 'win32' && !command.endsWith('.exe') ? `${command}.exe` : command
  const dirs = [
    ...(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean),
    join(homedir(), '.bun', 'bin'),
    join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'omp'),
    installDir(env),
  ]
  for (const dir of dirs) {
    const candidate = join(dir, exe)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Download the latest omp release into {@link installDir}, verified against SHA256SUMS.txt.
 * @param signal - aborts the download.
 * @returns the installed executable path.
 */
export async function installOmp(signal?: AbortSignal): Promise<string> {
  const asset = assetName(process.platform, process.arch)
  if (asset === undefined) throw new Error(`omp has no release for ${process.platform}-${process.arch}`)
  const get = async (file: string): Promise<Buffer> => {
    const response = await fetch(`${RELEASES}/${file}`, { signal: signal ?? null })
    if (!response.ok) throw new Error(`download ${file}: HTTP ${String(response.status)}`)
    return Buffer.from(await response.arrayBuffer())
  }
  const sums = (await get('SHA256SUMS.txt')).toString('utf8')
  const expected = sums.split('\n').map(line => line.trim().split(/\s+\*?/u)).find(([, name]) => name === asset)?.[0]
  if (expected === undefined) throw new Error(`SHA256SUMS.txt has no entry for ${asset}`)
  const body = await get(asset)
  const actual = createHash('sha256').update(body).digest('hex')
  if (actual !== expected.toLowerCase()) throw new Error(`checksum mismatch for ${asset}: refusing to install`)
  const dir = installDir()
  await mkdir(dir, { recursive: true })
  const target = join(dir, process.platform === 'win32' ? 'omp.exe' : 'omp')
  const temp = `${target}.download`
  await writeFile(temp, body)
  if (process.platform !== 'win32') await chmod(temp, 0o755)
  await rename(temp, target)
  return target
}

/**
 * Use an installed omp, installing it on first run when none exists.
 * @param command - configured command.
 * @param signal - aborts a needed download.
 * @returns an absolute executable path.
 */
export async function resolveOmp(command: string, signal?: AbortSignal): Promise<string> {
  return findOmp(command) ?? installOmp(signal)
}
