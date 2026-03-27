import minimatch from 'minimatch'

export type Format = 'space-delimited' | 'csv' | 'json'
export type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'

export interface ChangedFile {
  filename: string
  status: string
  patch?: string
}

export interface CategorizedFiles {
  all: string[]
  added: string[]
  modified: string[]
  removed: string[]
  renamed: string[]
  addedModified: string[]
  addedModifiedRenamed: string[]
}

export interface FormattedOutput {
  all: string
  added: string
  modified: string
  removed: string
  renamed: string
  addedModified: string
  addedModifiedRenamed: string
}

export function getBaseAndHead(
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): {base: string; head: string} {
  let base: string | undefined
  let head: string | undefined

  switch (eventName) {
    case 'pull_request_target':
    case 'pull_request':
      base = payload.pull_request?.base?.sha
      head = payload.pull_request?.head?.sha
      break
    case 'merge_group':
      base = payload.merge_group?.base_sha
      head = payload.merge_group?.head_sha
      break
    case 'push':
      base = payload.before
      head = payload.after
      break
    default:
      throw new Error(
        `This action only supports pull requests and pushes, ${eventName} events are not supported. ` +
          "Please submit an issue on this action's GitHub repo if you believe this in correct."
      )
  }

  if (!base || !head) {
    throw new Error(
      `The base and head commits are missing from the payload for this ${eventName} event. ` +
        "Please submit an issue on this action's GitHub repo."
    )
  }

  return {base, head}
}

export function filterFiles(files: ChangedFile[], patterns: string[]): ChangedFile[] {
  return files.filter(file => {
    let match = false
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        match = match && minimatch(file.filename, pattern, {matchBase: true, dot: true})
      } else {
        match = match || minimatch(file.filename, pattern, {matchBase: true, dot: true})
      }
    }
    return match
  })
}

export function categorizeFiles(files: ChangedFile[]): CategorizedFiles {
  const all: string[] = []
  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []
  const renamed: string[] = []
  const addedModified: string[] = []
  const addedModifiedRenamed: string[] = []

  for (const file of files) {
    const filename = file.filename
    all.push(filename)
    switch (file.status as FileStatus) {
      case 'added':
        added.push(filename)
        addedModified.push(filename)
        addedModifiedRenamed.push(filename)
        break
      case 'modified':
        modified.push(filename)
        addedModified.push(filename)
        addedModifiedRenamed.push(filename)
        break
      case 'removed':
        removed.push(filename)
        break
      case 'renamed':
        renamed.push(filename)
        addedModifiedRenamed.push(filename)
        if (file.patch) {
          modified.push(filename)
          addedModified.push(filename)
        }
        break
      default:
        throw new Error(
          `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
        )
    }
  }

  return {all, added, modified, removed, renamed, addedModified, addedModifiedRenamed}
}

export function formatOutput(categories: CategorizedFiles, format: Format): FormattedOutput {
  const formatArray = (arr: string[]): string => {
    switch (format) {
      case 'space-delimited':
        for (const file of arr) {
          if (file.includes(' ')) {
            throw new Error(
              'One of your files includes a space. Consider using a different output format or removing spaces from your filenames.'
            )
          }
        }
        return arr.join(' ')
      case 'csv':
        return arr.join(',')
      case 'json':
        return JSON.stringify(arr)
    }
  }

  return {
    all: formatArray(categories.all),
    added: formatArray(categories.added),
    modified: formatArray(categories.modified),
    removed: formatArray(categories.removed),
    renamed: formatArray(categories.renamed),
    addedModified: formatArray(categories.addedModified),
    addedModifiedRenamed: formatArray(categories.addedModifiedRenamed),
  }
}
