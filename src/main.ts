import * as core from '@actions/core'
import * as github from '@actions/github'
import {filterFiles, categorizeFiles, formatOutput, getBaseAndHead, Format, ChangedFile} from './helpers'

export async function run(): Promise<void> {
  try {
    // Create GitHub client with the API token.
    const client = github.getOctokit(core.getInput('token', {required: true}))
    const format = core.getInput('format', {required: true}) as Format
    const filter = core.getMultilineInput('filter', {required: true})

    // Ensure that the format parameter is set properly.
    if (format !== 'space-delimited' && format !== 'csv' && format !== 'json') {
      core.setFailed(`Format must be one of 'space-delimited', 'csv', or 'json', got '${format}'.`)
      return
    }

    // Debug log the payload.
    core.debug(`Payload keys: ${Object.keys(github.context.payload)}`)

    // Get base and head commits from the event payload.
    const {base, head} = getBaseAndHead(github.context.eventName, github.context.payload)

    // Log the base and head commits
    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    // Use GitHub's compare two commits API.
    // https://developer.github.com/v3/repos/commits/#compare-two-commits
    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    })

    // Ensure that the request was successful.
    if (response.status !== 200) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${github.context.eventName} event returned ${response.status}, expected 200. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    // Map response files to our ChangedFile interface.
    const responseFiles: ChangedFile[] = (response.data.files || []).map(f => ({
      filename: f.filename,
      status: f.status,
      patch: f.patch,
    }))

    const files = filterFiles(responseFiles, filter)
    const categories = categorizeFiles(files)
    const formatted = formatOutput(categories, format)

    // Log the output values.
    core.info(`All: ${formatted.all}`)
    core.info(`Added: ${formatted.added}`)
    core.info(`Modified: ${formatted.modified}`)
    core.info(`Removed: ${formatted.removed}`)
    core.info(`Renamed: ${formatted.renamed}`)
    core.info(`Added or modified: ${formatted.addedModified}`)
    core.info(`Added, modified or renamed: ${formatted.addedModifiedRenamed}`)

    // Set step output context.
    core.setOutput('all', formatted.all)
    core.setOutput('added', formatted.added)
    core.setOutput('modified', formatted.modified)
    core.setOutput('removed', formatted.removed)
    core.setOutput('renamed', formatted.renamed)
    core.setOutput('added_modified', formatted.addedModified)
    core.setOutput('added_modified_renamed', formatted.addedModifiedRenamed)

    // For backwards-compatibility
    core.setOutput('deleted', formatted.removed)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
