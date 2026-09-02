import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const trackedConfigDir = path.join(rootDir, 'data', 'configdata')
const sourcePackContractPath = path.join(rootDir, 'data', 'contracts', 'configdata-source-pack-contract.v1.json')
const sourcePackHydratorPath = path.join(rootDir, 'scripts', 'hydrate-configdata-source-pack-v1.mjs')
const dumpPath = path.join(rootDir, 'data', 'metadata', 'dump.cs')
const CONFIGDATA_SOURCE_ROOT_ENV = 'CONFIGDATA_SOURCE_ROOT'

let configDir = trackedConfigDir

const STATUS = {
  PASS: 0,
  SUSPECT: 1,
  BROKEN: 2,
}

function setStatus(result, status) {
  if (STATUS[status] > STATUS[result.status]) result.status = status
}

function addIssue(result, status, message) {
  setStatus(result, status)
  result.issues.push({ status, message })
}

function hashText(text) {
  return createHash('sha1').update(text).digest('hex')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readSourcePackContract() {
  const contract = JSON.parse(await readFile(sourcePackContractPath, 'utf8'))
  if (
    contract?.version !== 1 ||
    contract?.contract !== 'configdata-source-pack' ||
    contract?.stage !== 'repository-size-reduction-B2' ||
    contract?.status !== 'PASS' ||
    contract?.owner !== 'configdata-source-pack' ||
    contract?.authority?.logicalRawPathNamespace !== 'data/configdata' ||
    contract?.coverage?.fileCount !== 753 ||
    contract?.coverage?.missingCount !== 0 ||
    contract?.coverage?.extraCount !== 0 ||
    contract?.coverage?.duplicatePathCount !== 0
  ) {
    throw new Error('ConfigData integrity source-pack contract is not admitted B2 PASS input')
  }
  return contract
}

async function listJsonFiles(directory) {
  if (!(await exists(directory))) return []
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

async function hydratePinnedSourcePack(expectedCount) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'configdata-integrity-'))
  const targetRoot = path.join(tempRoot, 'hydrated')
  const result = spawnSync(
    process.execPath,
    [sourcePackHydratorPath, '--target-dir', targetRoot],
    {
      cwd: rootDir,
      encoding: 'utf8',
      shell: false,
      env: process.env,
    },
  )

  if (result.status !== 0) {
    await rm(tempRoot, { recursive: true, force: true })
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`pinned ConfigData source-pack hydration failed${detail ? `: ${detail}` : ''}`)
  }

  const hydratedConfigDir = path.join(targetRoot, 'data', 'configdata')
  const filenames = await listJsonFiles(hydratedConfigDir)
  if (filenames.length !== expectedCount) {
    await rm(tempRoot, { recursive: true, force: true })
    throw new Error(`hydrated ConfigData file count mismatch: expected ${expectedCount}, got ${filenames.length}`)
  }

  return {
    configDir: hydratedConfigDir,
    sourceMode: 'PINNED_B2_EXTERNAL_HYDRATION',
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  }
}

async function resolveConfigDataSource() {
  const contract = await readSourcePackContract()
  const expectedCount = contract.coverage.fileCount
  const explicitRoot = process.env[CONFIGDATA_SOURCE_ROOT_ENV]

  if (explicitRoot) {
    const resolvedRoot = path.resolve(explicitRoot)
    const explicitConfigDir = path.join(resolvedRoot, 'data', 'configdata')
    const filenames = await listJsonFiles(explicitConfigDir)
    if (filenames.length !== expectedCount) {
      throw new Error(
        `${CONFIGDATA_SOURCE_ROOT_ENV} must expose the exact admitted ConfigData set: expected ${expectedCount}, got ${filenames.length}`,
      )
    }
    return {
      configDir: explicitConfigDir,
      sourceMode: 'EXPLICIT_CONFIGDATA_SOURCE_ROOT',
      cleanup: null,
    }
  }

  const trackedFilenames = await listJsonFiles(trackedConfigDir)
  if (trackedFilenames.length === expectedCount) {
    return {
      configDir: trackedConfigDir,
      sourceMode: 'TRACKED_REPOSITORY_ROOT',
      cleanup: null,
    }
  }

  if (trackedFilenames.length > 0) {
    throw new Error(
      `partial tracked ConfigData root is forbidden: expected ${expectedCount} JSON files or zero after admitted deletion, got ${trackedFilenames.length}`,
    )
  }

  return hydratePinnedSourcePack(expectedCount)
}

function validateLegacyObject(data, result, basename) {
  const keys = Object.keys(data)

  if (keys.length === 1 && keys[0] === 'm_GameObject' && data.m_GameObject === null) {
    addIssue(result, 'SUSPECT', 'contains only m_GameObject=null')
  }

  if ('m_Enabled' in data && typeof data.m_Enabled === 'number' && ![0, 1].includes(data.m_Enabled)) {
    addIssue(result, 'BROKEN', `invalid m_Enabled=${data.m_Enabled}`)
  }

  if ('m_size' in data) {
    if (!Number.isInteger(data.m_size) || data.m_size < 0) {
      addIssue(result, 'BROKEN', `invalid m_size=${String(data.m_size)}`)
    }
  }

  if ('m_bytes' in data) {
    if (data.m_bytes === null) {
      if (typeof data.m_size === 'number' && data.m_size > 0) {
        addIssue(result, 'BROKEN', `m_bytes=null while m_size=${data.m_size}`)
      } else {
        addIssue(result, 'SUSPECT', 'm_bytes=null')
      }
    } else if (!Array.isArray(data.m_bytes)) {
      addIssue(result, 'BROKEN', 'm_bytes is neither an array nor null')
    } else {
      const invalidByte = data.m_bytes.findIndex(
        (value) => !Number.isInteger(value) || value < 0 || value > 255,
      )
      if (invalidByte !== -1) {
        addIssue(result, 'BROKEN', `m_bytes contains invalid byte at index ${invalidByte}`)
      }

      if (Number.isInteger(data.m_size) && data.m_size !== data.m_bytes.length) {
        addIssue(
          result,
          'BROKEN',
          `m_size=${data.m_size} but m_bytes.length=${data.m_bytes.length}`,
        )
      }
    }
  }

  if (typeof data.m_Name === 'string' && data.m_Name.length > 0 && data.m_Name !== basename) {
    addIssue(result, 'SUSPECT', `m_Name=${JSON.stringify(data.m_Name)} differs from filename`)
  }
}

function validateParsedJsonRoot(data, result, basename) {
  if (Array.isArray(data)) {
    const invalidRecord = data.findIndex((record) => !isPlainObject(record))
    if (invalidRecord !== -1) {
      addIssue(result, 'BROKEN', `array record at index ${invalidRecord} is not an object`)
    }
    return
  }

  if (isPlainObject(data)) {
    validateLegacyObject(data, result, basename)
    return
  }

  addIssue(result, 'BROKEN', 'JSON root is neither a record array nor an object')
}

function extractDumpTypes(dumpText) {
  const classes = new Set()
  const parsers = new Set()

  for (const match of dumpText.matchAll(/public\s+(?:sealed\s+|partial\s+|abstract\s+)*class\s+(ConfigData[A-Za-z0-9_]+)/g)) {
    classes.add(match[1])
  }

  for (const match of dumpText.matchAll(/MessageParser<\s*(ConfigData[A-Za-z0-9_]+)\s*>/g)) {
    parsers.add(match[1])
  }

  return { classes, parsers }
}

async function loadDumpMetadata() {
  try {
    const dumpText = await readFile(dumpPath, 'utf8')
    return { available: true, ...extractDumpTypes(dumpText) }
  } catch (error) {
    return {
      available: false,
      classes: new Set(),
      parsers: new Set(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function inspectFile(filename, dumpMetadata) {
  const fullPath = path.join(configDir, filename)
  const basename = path.basename(filename, '.json')
  const fileStat = await stat(fullPath)
  const raw = await readFile(fullPath, 'utf8')

  const result = {
    file: filename,
    size: fileStat.size,
    hash: hashText(raw),
    status: 'PASS',
    issues: [],
    dumpClass: null,
    dumpParser: null,
  }

  if (fileStat.size === 0 || raw.trim().length === 0) {
    addIssue(result, 'BROKEN', 'empty file')
  } else {
    let data
    try {
      data = JSON.parse(raw)
    } catch (error) {
      addIssue(
        result,
        'BROKEN',
        `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    if (data !== undefined) validateParsedJsonRoot(data, result, basename)
  }

  if (dumpMetadata.available) {
    result.dumpClass = dumpMetadata.classes.has(basename)
    result.dumpParser = dumpMetadata.parsers.has(basename)

    if (!result.dumpClass) {
      addIssue(result, 'SUSPECT', 'matching ConfigData class not found in dump.cs')
    } else if (!result.dumpParser) {
      result.issues.push({ status: 'INFO', message: 'class exists but MessageParser<T> was not found' })
    }
  }

  return result
}

function printResult(result) {
  if (result.status === 'PASS') return
  console.log(`\n[${result.status}] ${result.file} (${result.size} bytes)`)
  for (const issue of result.issues) {
    console.log(`  - ${issue.status}: ${issue.message}`)
  }
  if (result.dumpClass !== null) {
    console.log(`  - dump.cs: class=${result.dumpClass ? 'yes' : 'no'}, parser=${result.dumpParser ? 'yes' : 'no'}`)
  }
}

async function main() {
  const source = await resolveConfigDataSource()
  configDir = source.configDir

  try {
    const dumpMetadata = await loadDumpMetadata()
    const filenames = await listJsonFiles(configDir)

    const results = []
    for (const filename of filenames) {
      results.push(await inspectFile(filename, dumpMetadata))
    }

    const duplicateGroups = new Map()
    for (const result of results) {
      const group = duplicateGroups.get(result.hash) ?? []
      group.push(result.file)
      duplicateGroups.set(result.hash, group)
    }

    const duplicates = [...duplicateGroups.entries()]
      .filter(([, files]) => files.length > 1)
      .sort((a, b) => b[1].length - a[1].length)

    const counts = {
      PASS: results.filter((item) => item.status === 'PASS').length,
      SUSPECT: results.filter((item) => item.status === 'SUSPECT').length,
      BROKEN: results.filter((item) => item.status === 'BROKEN').length,
    }

    console.log('ConfigData integrity check')
    console.log(`Source mode: ${source.sourceMode}`)
    console.log(`Directory: ${path.relative(rootDir, configDir) || configDir}`)
    console.log(`Total JSON files: ${results.length}`)
    console.log(`PASS: ${counts.PASS}`)
    console.log(`SUSPECT: ${counts.SUSPECT}`)
    console.log(`BROKEN: ${counts.BROKEN}`)

    if (dumpMetadata.available) {
      console.log(`dump.cs ConfigData classes: ${dumpMetadata.classes.size}`)
      console.log(`dump.cs MessageParser types: ${dumpMetadata.parsers.size}`)
    } else {
      console.log(`dump.cs unavailable: ${dumpMetadata.error}`)
    }

    for (const result of results) printResult(result)

    if (duplicates.length > 0) {
      console.log('\n[DUPLICATE CONTENT GROUPS]')
      for (const [, files] of duplicates) {
        console.log(`  ${files.length} files: ${files.join(', ')}`)
      }
    }

    console.log('\nNotes:')
    console.log('- Current UnityDataTool ConfigData sources are JSON record arrays; an empty array is valid.')
    console.log('- Array entries must be JSON objects; malformed non-object records are BROKEN.')
    console.log('- Legacy object-root integrity checks remain supported for compatibility.')
    console.log('- SUSPECT means manual verification/re-export may be needed; it is not proof of corruption.')
    console.log('- BROKEN means the parsed JSON itself is structurally inconsistent or unusable.')
    console.log('- Duplicate-content groups are reported for inspection and do not fail this structural integrity gate.')
    console.log('- A complete tracked root is preferred; an absent/zero-file root is verified through the pinned B2 external source pack.')
    console.log('- Partial tracked deletion fails closed.')

    if (counts.BROKEN > 0) process.exitCode = 1
  } finally {
    await source.cleanup?.()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
