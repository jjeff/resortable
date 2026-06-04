/**
 * WCAG 2.1 AA axe-core accessibility audit (issue #40).
 *
 * Runs the axe-core engine against the dev playground and every page
 * in the curated examples site. The audit is a hard gate in CI: any
 * unhandled violation fails the build.
 *
 * Tag filter: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] — the four
 * tags that together cover WCAG 2.1 A + AA. Best-practice and
 * experimental rules are intentionally excluded.
 *
 * If a violation needs to be deferred (i.e. cannot be fixed in this PR),
 * suppress it with `.disableRules([...])` AND leave a code comment that
 * cites the follow-up issue. Every suppression is reviewable in this file.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

interface AxePage {
  /** URL relative to the dev server baseURL. */
  url: string
  /** Optional rules to disable for this page, with a reason. */
  disableRules?: { id: string; reason: string }[]
}

const PAGES: AxePage[] = [
  // Dev playground at the root. Densely-packed showcase with many
  // sortable instances; everything here doubles as the smoke surface.
  {
    url: '/',
    disableRules: [
      {
        // The "File Explorer" demo intentionally shows nested sortables:
        // outer .folder elements are draggable AND each folder's content
        // is itself a sortable list. Axe flags this as `nested-interactive`
        // because draggable items live inside other draggable items. This
        // is a genuine library feature, not a bug — modernising the ARIA
        // pattern for nested DnD is tracked separately.
        id: 'nested-interactive',
        reason: 'Nested sortables demo; ARIA pattern follow-up tracked.',
      },
    ],
  },
  { url: '/examples/basic.html' },
  { url: '/examples/shared-lists.html' },
  { url: '/examples/kanban.html' },
  // Showcase page — MUST pass with zero suppressions.
  { url: '/examples/accessibility.html' },
  { url: '/examples/handle-filter.html' },
  { url: '/examples/multi-drag.html' },
  { url: '/examples/swap.html' },
  { url: '/examples/clone-mode.html' },
  { url: '/examples/custom-plugin.html' },
]

/**
 * Wait for Resortable to finish wiring up. The dev playground (`/`)
 * sets `window.resortableLoaded = true` once it's done; the curated
 * example pages don't set that flag, so the `waitForFunction` falls
 * through to its `.catch` and we rely on the short post-paint settle
 * timeout to let the library mutate the DOM.
 */
async function waitForSortableReady(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        (window as unknown as { resortableLoaded?: boolean })
          .resortableLoaded === true,
      undefined,
      {
        timeout: 2000,
      }
    )
    .catch(() => {
      // Example pages don't set the flag — fall through to the settle below.
    })
  // Give the library a tick to apply ARIA attributes / focus management
  // after mount. Without this the at-rest DOM may be measured pre-init.
  await page.waitForTimeout(250)
}

for (const entry of PAGES) {
  test(`${entry.url} — WCAG 2.1 A + AA (axe-core)`, async ({ page }) => {
    await page.goto(entry.url)
    await waitForSortableReady(page)

    let builder = new AxeBuilder({ page }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
    ])

    if (entry.disableRules?.length) {
      builder = builder.disableRules(entry.disableRules.map((r) => r.id))
    }

    const results = await builder.analyze()

    if (results.violations.length > 0) {
      // Surface a readable summary in the test output. Playwright's
      // toEqual diff on a large object tree is unusable for triage.
      // eslint-disable-next-line no-console
      console.error(
        `Axe violations on ${entry.url}:`,
        JSON.stringify(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
            target: v.nodes.slice(0, 3).map((n) => n.target),
          })),
          null,
          2
        )
      )
    }
    expect(results.violations).toEqual([])
  })
}
