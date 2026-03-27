import {getBaseAndHead, filterFiles, categorizeFiles, formatOutput, ChangedFile} from '../src/helpers'

describe('getBaseAndHead', () => {
  test('extracts base and head from pull_request event', () => {
    const payload = {
      pull_request: {
        base: {sha: 'base-sha-123'},
        head: {sha: 'head-sha-456'},
      },
    }
    expect(getBaseAndHead('pull_request', payload)).toEqual({
      base: 'base-sha-123',
      head: 'head-sha-456',
    })
  })

  test('extracts base and head from pull_request_target event', () => {
    const payload = {
      pull_request: {
        base: {sha: 'base-sha'},
        head: {sha: 'head-sha'},
      },
    }
    expect(getBaseAndHead('pull_request_target', payload)).toEqual({
      base: 'base-sha',
      head: 'head-sha',
    })
  })

  test('extracts base and head from push event', () => {
    const payload = {
      before: 'before-sha',
      after: 'after-sha',
    }
    expect(getBaseAndHead('push', payload)).toEqual({
      base: 'before-sha',
      head: 'after-sha',
    })
  })

  test('extracts base and head from merge_group event', () => {
    const payload = {
      merge_group: {
        base_sha: 'mg-base-sha',
        head_sha: 'mg-head-sha',
      },
    }
    expect(getBaseAndHead('merge_group', payload)).toEqual({
      base: 'mg-base-sha',
      head: 'mg-head-sha',
    })
  })

  test('throws for unsupported event type', () => {
    expect(() => getBaseAndHead('issue_comment', {})).toThrow(
      'This action only supports pull requests and pushes, issue_comment events are not supported.'
    )
  })

  test('throws when base commit is missing from pull_request', () => {
    const payload = {
      pull_request: {
        base: {},
        head: {sha: 'head-sha'},
      },
    }
    expect(() => getBaseAndHead('pull_request', payload)).toThrow(
      'The base and head commits are missing from the payload'
    )
  })

  test('throws when head commit is missing from push', () => {
    const payload = {
      before: 'before-sha',
    }
    expect(() => getBaseAndHead('push', payload)).toThrow('The base and head commits are missing from the payload')
  })
})

describe('filterFiles', () => {
  const files: ChangedFile[] = [
    {filename: 'src/main.ts', status: 'modified'},
    {filename: 'src/helpers.ts', status: 'added'},
    {filename: 'README.md', status: 'modified'},
    {filename: 'package.json', status: 'modified'},
    {filename: '.github/workflows/test.yml', status: 'modified'},
    {filename: 'dist/index.js', status: 'modified'},
  ]

  test('matches all files with wildcard pattern', () => {
    const result = filterFiles(files, ['*'])
    expect(result).toHaveLength(6)
  })

  test('filters by file extension', () => {
    const result = filterFiles(files, ['*.ts'])
    expect(result.map(f => f.filename)).toEqual(['src/main.ts', 'src/helpers.ts'])
  })

  test('filters by glob pattern', () => {
    const result = filterFiles(files, ['src/**'])
    expect(result.map(f => f.filename)).toEqual(['src/main.ts', 'src/helpers.ts'])
  })

  test('supports exclusion patterns', () => {
    const result = filterFiles(files, ['*', '!*.md'])
    expect(result.map(f => f.filename)).not.toContain('README.md')
    expect(result).toHaveLength(5)
  })

  test('supports multiple inclusion patterns', () => {
    const result = filterFiles(files, ['*.ts', '*.json'])
    expect(result.map(f => f.filename)).toEqual(['src/main.ts', 'src/helpers.ts', 'package.json'])
  })

  test('supports combined inclusion and exclusion patterns', () => {
    const result = filterFiles(files, ['*.yml', '*.ts', 'package*', '!.github/*/*.yml', '!*.json'])
    expect(result.map(f => f.filename)).toEqual(['src/main.ts', 'src/helpers.ts'])
  })

  test('returns empty array when no files match', () => {
    const result = filterFiles(files, ['*.py'])
    expect(result).toHaveLength(0)
  })

  test('handles dot files', () => {
    const dotFiles: ChangedFile[] = [{filename: '.gitignore', status: 'modified'}]
    const result = filterFiles(dotFiles, ['.*'])
    expect(result).toHaveLength(1)
  })
})

describe('categorizeFiles', () => {
  test('categorizes added files', () => {
    const files: ChangedFile[] = [{filename: 'new-file.ts', status: 'added'}]
    const result = categorizeFiles(files)
    expect(result.all).toEqual(['new-file.ts'])
    expect(result.added).toEqual(['new-file.ts'])
    expect(result.addedModified).toEqual(['new-file.ts'])
    expect(result.addedModifiedRenamed).toEqual(['new-file.ts'])
    expect(result.modified).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.renamed).toEqual([])
  })

  test('categorizes modified files', () => {
    const files: ChangedFile[] = [{filename: 'existing.ts', status: 'modified'}]
    const result = categorizeFiles(files)
    expect(result.all).toEqual(['existing.ts'])
    expect(result.modified).toEqual(['existing.ts'])
    expect(result.addedModified).toEqual(['existing.ts'])
    expect(result.addedModifiedRenamed).toEqual(['existing.ts'])
    expect(result.added).toEqual([])
  })

  test('categorizes removed files', () => {
    const files: ChangedFile[] = [{filename: 'deleted.ts', status: 'removed'}]
    const result = categorizeFiles(files)
    expect(result.all).toEqual(['deleted.ts'])
    expect(result.removed).toEqual(['deleted.ts'])
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.addedModified).toEqual([])
    expect(result.addedModifiedRenamed).toEqual([])
  })

  test('categorizes renamed files', () => {
    const files: ChangedFile[] = [{filename: 'new-name.ts', status: 'renamed'}]
    const result = categorizeFiles(files)
    expect(result.all).toEqual(['new-name.ts'])
    expect(result.renamed).toEqual(['new-name.ts'])
    expect(result.addedModifiedRenamed).toEqual(['new-name.ts'])
    expect(result.modified).toEqual([])
    expect(result.addedModified).toEqual([])
  })

  test('renamed file with patch is also categorized as modified', () => {
    const files: ChangedFile[] = [{filename: 'new-name.ts', status: 'renamed', patch: '@@ -1,3 +1,5 @@'}]
    const result = categorizeFiles(files)
    expect(result.renamed).toEqual(['new-name.ts'])
    expect(result.modified).toEqual(['new-name.ts'])
    expect(result.addedModified).toEqual(['new-name.ts'])
    expect(result.addedModifiedRenamed).toEqual(['new-name.ts'])
  })

  test('categorizes mixed file statuses', () => {
    const files: ChangedFile[] = [
      {filename: 'added.ts', status: 'added'},
      {filename: 'modified.ts', status: 'modified'},
      {filename: 'removed.ts', status: 'removed'},
      {filename: 'renamed.ts', status: 'renamed'},
    ]
    const result = categorizeFiles(files)
    expect(result.all).toEqual(['added.ts', 'modified.ts', 'removed.ts', 'renamed.ts'])
    expect(result.added).toEqual(['added.ts'])
    expect(result.modified).toEqual(['modified.ts'])
    expect(result.removed).toEqual(['removed.ts'])
    expect(result.renamed).toEqual(['renamed.ts'])
    expect(result.addedModified).toEqual(['added.ts', 'modified.ts'])
    expect(result.addedModifiedRenamed).toEqual(['added.ts', 'modified.ts', 'renamed.ts'])
  })

  test('throws for unsupported file status', () => {
    const files: ChangedFile[] = [{filename: 'file.ts', status: 'copied'}]
    expect(() => categorizeFiles(files)).toThrow("unsupported file status 'copied'")
  })
})

describe('formatOutput', () => {
  const categories = {
    all: ['a.ts', 'b.ts', 'c.ts'],
    added: ['a.ts'],
    modified: ['b.ts'],
    removed: ['c.ts'],
    renamed: [],
    addedModified: ['a.ts', 'b.ts'],
    addedModifiedRenamed: ['a.ts', 'b.ts'],
  }

  test('formats as space-delimited', () => {
    const result = formatOutput(categories, 'space-delimited')
    expect(result.all).toBe('a.ts b.ts c.ts')
    expect(result.added).toBe('a.ts')
    expect(result.modified).toBe('b.ts')
    expect(result.removed).toBe('c.ts')
    expect(result.renamed).toBe('')
    expect(result.addedModified).toBe('a.ts b.ts')
    expect(result.addedModifiedRenamed).toBe('a.ts b.ts')
  })

  test('formats as csv', () => {
    const result = formatOutput(categories, 'csv')
    expect(result.all).toBe('a.ts,b.ts,c.ts')
    expect(result.added).toBe('a.ts')
    expect(result.renamed).toBe('')
  })

  test('formats as json', () => {
    const result = formatOutput(categories, 'json')
    expect(result.all).toBe('["a.ts","b.ts","c.ts"]')
    expect(result.added).toBe('["a.ts"]')
    expect(result.renamed).toBe('[]')
  })

  test('space-delimited throws when filename contains spaces', () => {
    const categoriesWithSpaces = {
      ...categories,
      all: ['file with spaces.ts'],
    }
    expect(() => formatOutput(categoriesWithSpaces, 'space-delimited')).toThrow('One of your files includes a space')
  })

  test('csv handles filenames with spaces', () => {
    const categoriesWithSpaces = {
      ...categories,
      all: ['file with spaces.ts'],
    }
    const result = formatOutput(categoriesWithSpaces, 'csv')
    expect(result.all).toBe('file with spaces.ts')
  })

  test('json handles filenames with spaces', () => {
    const categoriesWithSpaces = {
      ...categories,
      all: ['file with spaces.ts'],
    }
    const result = formatOutput(categoriesWithSpaces, 'json')
    expect(result.all).toBe('["file with spaces.ts"]')
  })

  test('handles empty file arrays', () => {
    const emptyCategories = {
      all: [],
      added: [],
      modified: [],
      removed: [],
      renamed: [],
      addedModified: [],
      addedModifiedRenamed: [],
    }
    const result = formatOutput(emptyCategories, 'space-delimited')
    expect(result.all).toBe('')
    expect(result.added).toBe('')

    const jsonResult = formatOutput(emptyCategories, 'json')
    expect(jsonResult.all).toBe('[]')
  })
})
