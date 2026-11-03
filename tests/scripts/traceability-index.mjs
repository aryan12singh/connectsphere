// Builds docs/test-traceability.md: every story, its specified test cases and
// the automated tests that reference them, across all layers.
// Run from the repo root: node tests/scripts/traceability-index.mjs
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const STORIES = {
  'CS-10': 'Secure Login and Role-Based Navigation',
  'CS-11': 'Submit and View an Event Request',
  'CS-12': 'Review, Approve, Reject or Return an Assigned Event Request',
  'CS-15': 'Configure Continuous Integration and Build Checks',
  'CS-26': 'Register Accounts and Enforce Role-and-Event Permissions',
  'CS-27': 'Validate and Resubmit Returned Event Requests',
  'CS-29': 'Save and Resume a Draft Event Request',
  'CS-30': 'Lead Assignment and Reassignment of the Event Coordinator',
  'CS-33': 'Maintain Venue Catalogue and Operating Information',
  'CS-34': 'View Venue Availability Calendar',
  'CS-35': 'Record Operational Venue Unavailability',
  'CS-36': 'Search, Filter and Assess Suitable Venues',
  'CS-37': 'Request a Venue with an Expiring Tentative Hold',
  'CS-38': 'Approve or Reject a Venue Booking Request',
  'CS-39': 'Prevent Overlapping Venue Commitments',
  'CS-40': 'Record and Review Equipment and Technical Requirements',
  'CS-41': 'Check Equipment Availability and Operational Status',
  'CS-42': 'Reserve the Complete Equipment Request',
  'CS-43': 'View and Update Event Planning Information',
  'CS-44': 'View Event Activity and Change History',
  'CS-45': 'Review Event Changes and Reassess Affected Arrangements',
  'CS-46': 'Release Equipment Reservations After Event Cancellation',
  'CS-47': 'View Confirmed Event Information',
  'CS-48': 'Configure Event Registration and Manage Registration Records',
  'CS-49': 'Configure Withdrawal Rules and Withdraw Registration',
  'CS-50': 'Deliver Event Lifecycle and Coordinator Assignment Notifications',
  'CS-51': 'Deliver Planning Decisions and Staff Action Notifications',
  'CS-52': 'Notify Attendees of Registration Outcomes and Event Changes',
  'CS-54': 'Approve Event Cancellation and Release Related Commitments',
  'CS-73': 'Expand the CI pipeline',
  'CS-78': 'Design and Verify Hold Expiry Scheduling and Clock Semantics',
  'CS-79': 'Finalize Release 1 CI, Coverage Gates and Integration Tests',
  'CS-81': 'View the Unassigned Event Request Queue',
  'CS-83': 'Oversee Coordinator Assignments and Active Events',
  'CS-84': 'Configure Venue Setup and Turnaround Times',
  'CS-85': 'Apply Venue Buffers to Availability and Conflict Checks',
  'CS-86': 'Flag Existing Bookings That Conflict Under Buffer Rules',
  'CS-87': 'Book Multiple Venues for One Event',
  'CS-88': 'Change or Cancel One Venue Booking Independently',
  'CS-90': 'Expire Tentative Holds and Notify the Coordinator',
  'CS-91': 'Mark a Booked Venue Temporarily Unavailable',
  'CS-92': 'Find and Request a Replacement Venue for an Affected Booking',
  'CS-93': 'Send an Event for Operational Safety Check',
  'CS-94': 'Conduct the Operational Safety Check',
  'CS-95': 'Rework Arrangements After Safety Changes or Rejection',
}

// CI tasks are proven by the workflow runs themselves, not by test files.
const CI_TASKS = new Set(['CS-15', 'CS-73', 'CS-79'])

const LAYERS = [
  { name: 'Unit / component / BFF (Vitest)', dirs: ['tests/specs'] },
  { name: 'Service unit, contract and PostgreSQL (node --test, unittest)', dirs: readdirSync(join(root, 'services')).map(s => `services/${s}/tests`) },
  { name: 'Live browser journeys (Playwright)', dirs: ['frontend/e2e'] },
]

function files(dir) {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(relative(root, path))
    return /\.(c|m)?(j|t)s$|\.py$/.test(name) ? [relative(root, path)] : []
  })
}

const caseId = /TC-CS-?(\d+)-(\d+[a-z]?)/g
const norm = (story, n) => `TC-CS${story}-${n.padStart(2, '0')}`
const storyOf = id => `CS-${/TC-CS(\d+)/.exec(id)[1]}`

// layer -> story -> { files:Set, cases:Set }
const automated = LAYERS.map(layer => ({ ...layer, stories: new Map() }))
for (const layer of automated) {
  for (const file of layer.dirs.flatMap(files)) {
    const text = readFileSync(join(root, file), 'utf8')
    const stories = new Set([...file.matchAll(/CS-(\d+)/g)].map(m => `CS-${m[1]}`))
    const cases = new Set([...text.matchAll(caseId)].map(m => norm(m[1], m[2])))
    for (const id of cases) stories.add(storyOf(id))
    for (const story of stories) {
      if (!STORIES[story]) continue
      const entry = layer.stories.get(story) ?? { files: new Set(), cases: new Set() }
      entry.files.add(file)
      for (const id of cases) if (storyOf(id) === story) entry.cases.add(id)
      layer.stories.set(story, entry)
    }
  }
}

// Cases specified in tests/records/<story>/test-cases.md
const specified = new Map()
for (const story of Object.keys(STORIES)) {
  const path = join(root, 'tests/records', story, 'test-cases.md')
  if (!existsSync(path)) continue
  specified.set(story, new Set([...readFileSync(path, 'utf8').matchAll(caseId)].map(m => norm(m[1], m[2])).filter(id => storyOf(id) === story)))
}

const link = path => `[${path.split('/').pop()}](../${path})`
const out = []
out.push('# Test traceability', '')
out.push('Generated by `node tests/scripts/traceability-index.mjs`; do not edit by hand.', '')
out.push('Each story links its case specification and dated runs in `tests/records`, then every automated test file that references the story or one of its `TC-CS…` case IDs. "Automated" counts the specified cases that at least one automated test names. Cases without an automated reference are covered by manual or live execution recorded in the Sprint test sheet.', '')
out.push('| Story | Title | Specified cases | Automated | Unit / BFF | Service | Browser | Records |')
out.push('|---|---|---:|---:|---:|---:|---:|---|')
let totalSpecified = 0, totalAutomated = 0
for (const [story, title] of Object.entries(STORIES)) {
  const spec = specified.get(story) ?? new Set()
  const named = new Set(automated.flatMap(l => [...(l.stories.get(story)?.cases ?? [])]))
  const traced = [...spec].filter(id => named.has(id)).length
  totalSpecified += spec.size; totalAutomated += traced
  const counts = automated.map(l => l.stories.get(story)?.files.size ?? 0)
  const records = existsSync(join(root, 'tests/records', story)) ? `[${story}](../tests/records/${story})` : 'Sprint sheet'
  const cell = CI_TASKS.has(story) ? 'CI runs' : (spec.size ? traced : '–')
  out.push(`| [${story}](https://spmg8.atlassian.net/browse/${story}) | ${title} | ${spec.size || '–'} | ${cell} | ${counts[0] || '–'} | ${counts[1] || '–'} | ${counts[2] || '–'} | ${records} |`)
}
out.push('', `Totals: ${totalSpecified} specified cases in \`tests/records\`; ${totalAutomated} named by at least one automated test. CI tasks (${[...CI_TASKS].join(', ')}) are proven by the [CI workflow](../.github/workflows/event-workflows.yml) runs.`, '')
out.push('## Files by story', '')
for (const story of Object.keys(STORIES)) {
  const rows = automated.map(l => [l.name, [...(l.stories.get(story)?.files ?? [])].sort()]).filter(([, f]) => f.length)
  if (!rows.length) continue
  out.push(`### ${story} — ${STORIES[story]}`, '')
  for (const [name, list] of rows) out.push(`- ${name}: ${list.map(link).join(', ')}`)
  if (!specified.has(story)) {
    const named = [...new Set(automated.flatMap(l => [...(l.stories.get(story)?.cases ?? [])]))].sort()
    out.push(`- Case IDs named in tests: ${named.length ? named.join(', ') : 'none; tests are named by scenario'}`)
  }
  out.push('')
}
writeFileSync(join(root, 'docs/test-traceability.md'), out.join('\n'))
console.log(`docs/test-traceability.md: ${Object.keys(STORIES).length} stories, ${totalSpecified} specified cases, ${totalAutomated} automated`)
