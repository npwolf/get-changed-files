import * as core from '@actions/core'
import * as github from '@actions/github'

jest.mock('@actions/core')
jest.mock('@actions/github')

const mockedCore = jest.mocked(core)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedGithub = github as any

const mockCompareCommits = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()

  // Default mock for getOctokit
  mockedGithub.getOctokit = jest.fn().mockReturnValue({
    rest: {
      repos: {
        compareCommits: mockCompareCommits,
      },
    },
  })

  // Default inputs
  mockedCore.getInput.mockImplementation((name: string) => {
    switch (name) {
      case 'token':
        return 'fake-token'
      case 'format':
        return 'space-delimited'
      default:
        return ''
    }
  })
  mockedCore.getMultilineInput.mockReturnValue(['*'])

  // Default context
  mockedGithub.context = {
    eventName: 'pull_request',
    payload: {
      pull_request: {
        base: {sha: 'base-sha'},
        head: {sha: 'head-sha'},
      },
    },
    repo: {owner: 'test-owner', repo: 'test-repo'},
  }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {run} = require('../src/main')

describe('run', () => {
  test('sets all outputs for a pull_request event with changed files', async () => {
    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {
        files: [
          {filename: 'src/main.ts', status: 'modified'},
          {filename: 'src/new.ts', status: 'added'},
          {filename: 'src/old.ts', status: 'removed'},
        ],
      },
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', 'src/main.ts src/new.ts src/old.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added', 'src/new.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('modified', 'src/main.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('removed', 'src/old.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('renamed', '')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added_modified', 'src/main.ts src/new.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added_modified_renamed', 'src/main.ts src/new.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('deleted', 'src/old.ts')
  })

  test('works with push events', async () => {
    mockedGithub.context = {
      eventName: 'push',
      payload: {before: 'before-sha', after: 'after-sha'},
      repo: {owner: 'test-owner', repo: 'test-repo'},
    }

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {files: [{filename: 'README.md', status: 'modified'}]},
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockCompareCommits).toHaveBeenCalledWith({
      base: 'before-sha',
      head: 'after-sha',
      owner: 'test-owner',
      repo: 'test-repo',
    })
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', 'README.md')
  })

  test('works with merge_group events', async () => {
    mockedGithub.context = {
      eventName: 'merge_group',
      payload: {merge_group: {base_sha: 'mg-base', head_sha: 'mg-head'}},
      repo: {owner: 'test-owner', repo: 'test-repo'},
    }

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {files: []},
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockCompareCommits).toHaveBeenCalledWith({
      base: 'mg-base',
      head: 'mg-head',
      owner: 'test-owner',
      repo: 'test-repo',
    })
  })

  test('formats output as csv', async () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === 'format') return 'csv'
      if (name === 'token') return 'fake-token'
      return ''
    })

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {
        files: [
          {filename: 'a.ts', status: 'added'},
          {filename: 'b.ts', status: 'modified'},
        ],
      },
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', 'a.ts,b.ts')
  })

  test('formats output as json', async () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === 'format') return 'json'
      if (name === 'token') return 'fake-token'
      return ''
    })

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {
        files: [
          {filename: 'a.ts', status: 'added'},
          {filename: 'b.ts', status: 'modified'},
        ],
      },
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', '["a.ts","b.ts"]')
  })

  test('applies file filter patterns', async () => {
    mockedCore.getMultilineInput.mockReturnValue(['*.ts', '!*.test.ts'])

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {
        files: [
          {filename: 'src/main.ts', status: 'modified'},
          {filename: 'src/main.test.ts', status: 'modified'},
          {filename: 'README.md', status: 'modified'},
        ],
      },
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', 'src/main.ts')
  })

  test('handles renamed files with patch as modified', async () => {
    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {
        files: [{filename: 'new-name.ts', status: 'renamed', patch: '@@ -1,3 +1,5 @@'}],
      },
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('renamed', 'new-name.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('modified', 'new-name.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added_modified', 'new-name.ts')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added_modified_renamed', 'new-name.ts')
  })

  test('calls setFailed for invalid format', async () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === 'format') return 'invalid'
      if (name === 'token') return 'fake-token'
      return ''
    })

    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {files: []},
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('Format must be one of'))
  })

  test('calls setFailed for unsupported event type', async () => {
    mockedGithub.context = {
      eventName: 'issue_comment',
      payload: {},
      repo: {owner: 'test-owner', repo: 'test-repo'},
    }

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('issue_comment events are not supported'))
  })

  test('calls setFailed when API returns non-200', async () => {
    mockCompareCommits.mockResolvedValue({
      status: 500,
      data: {files: []},
    })

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('returned 500, expected 200'))
  })

  test('calls setFailed when API throws an error', async () => {
    mockCompareCommits.mockRejectedValue(new Error('API rate limit exceeded'))

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith('API rate limit exceeded')
  })

  test('calls setFailed with string for non-Error throws', async () => {
    mockCompareCommits.mockRejectedValue('something went wrong')

    await run()

    expect(mockedCore.setFailed).toHaveBeenCalledWith('something went wrong')
  })

  test('handles empty file list', async () => {
    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {files: []},
    })

    await run()

    expect(mockedCore.setFailed).not.toHaveBeenCalled()
    expect(mockedCore.setOutput).toHaveBeenCalledWith('all', '')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('added', '')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('modified', '')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('removed', '')
    expect(mockedCore.setOutput).toHaveBeenCalledWith('renamed', '')
  })

  test('passes correct parameters to compareCommits', async () => {
    mockCompareCommits.mockResolvedValue({
      status: 200,
      data: {files: []},
    })

    await run()

    expect(mockCompareCommits).toHaveBeenCalledWith({
      base: 'base-sha',
      head: 'head-sha',
      owner: 'test-owner',
      repo: 'test-repo',
    })
  })
})
