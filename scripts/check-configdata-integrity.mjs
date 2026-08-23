import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const configDir = path.join(rootDir, 'data', 'configdata')
const dumpPath = path.join(rootDir, 'data', 'metadata', 'dump.cs')

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

    if (data !== undefined) {
      if (!isPlainObject(data)) {
        addIssue(result, 'BROKEN', 'JSON root is not an object')
      } else {
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
    }
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
  const dumpMetadata = await loadDumpMetadata()
  const filenames = (await readdir(configDir))
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))

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
  console.log(`Directory: ${path.relative(rootDir, configDir)}`)
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
  console.log('- SUSPECT means manual verification/re-export may be needed; it is not proof of corruption.')
  console.log('- BROKEN means the exported JSON itself is internally inconsistent or unusable.')
  console.log('- AssetStudio 753-name completeness comparison is intentionally deferred to stage 2.')

  if (counts.BROKEN > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
