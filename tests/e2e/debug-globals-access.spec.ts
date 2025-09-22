import { test, expect } from '@playwright/test'

test.describe('Debug Globals Access', () => {
  test('check how to access Sortable instances from browser', async ({
    page,
  }) => {
    console.log('\n=== Debug Globals Access ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Wait a bit more to ensure scripts are fully loaded
    await page.waitForTimeout(1000)

    const accessCheck = await page.evaluate(() => {
      const result = {
        windowKeys: [] as string[],
        documentKeys: [] as string[],
        importedSortable: null as any,
        moduleAccess: null as any,
        staticAccess: null as any,
        scriptErrors: [] as string[],
      }

      // Check all window properties
      for (const key in window) {
        if (
          key.includes('ortable') ||
          key.includes('rag') ||
          key.includes('esort')
        ) {
          result.windowKeys.push(key)
        }
      }

      // Check document properties
      for (const key in document) {
        if (key.includes('ortable') || key.includes('rag')) {
          result.documentKeys.push(key)
        }
      }

      try {
        // Try to access the imported Sortable class directly
        // This should work since the HTML page imports it
        const Sortable = (window as any).Sortable
        if (Sortable) {
          result.importedSortable = {
            exists: true,
            isFunction: typeof Sortable === 'function',
            hasInstances: !!Sortable.instances,
            instancesType: typeof Sortable.instances,
            hasActive: 'active' in Sortable,
            hasDragged: 'dragged' in Sortable,
            hasClosest: 'closest' in Sortable,
            prototype: Object.getOwnPropertyNames(Sortable.prototype),
          }

          // Try to access the instances WeakMap
          if (Sortable.instances) {
            try {
              // We can't enumerate WeakMap, but we can test if elements are registered
              const multi1 = document.getElementById('multi-1')
              const multi2 = document.getElementById('multi-2')

              if (multi1 && multi2) {
                result.staticAccess = {
                  multi1HasInstance: Sortable.instances.has(multi1),
                  multi2HasInstance: Sortable.instances.has(multi2),
                  canGetInstance1: !!Sortable.instances.get(multi1),
                  canGetInstance2: !!Sortable.instances.get(multi2),
                }
              }
            } catch (e) {
              result.scriptErrors.push(`WeakMap access error: ${e}`)
            }
          }
        }

        // Try accessing through module system
        if ((window as any).__viteModule) {
          result.moduleAccess = {
            hasViteModule: true,
            moduleKeys: Object.keys((window as any).__viteModule),
          }
        }
      } catch (e) {
        result.scriptErrors.push(`Main access error: ${e}`)
      }

      return result
    })

    console.log('Access check results:', JSON.stringify(accessCheck, null, 2))

    // Also check if we can access DragManager registry through a different route
    const dragManagerCheck = await page.evaluate(() => {
      const result = {
        foundDragManager: false,
        registrySize: 0,
        registryAccess: null as any,
        globalDragStateFound: false,
        errors: [] as string[],
      }

      try {
        // The module is imported, so it should create instances
        // Let's check if we can find them through the elements themselves
        const multi1 = document.getElementById('multi-1')
        const multi2 = document.getElementById('multi-2')

        if (multi1 && multi2) {
          // Check if the elements have been initialized with Sortable
          result.registryAccess = {
            multi1HasDropZone: multi1.dataset.dropZone === 'true',
            multi2HasDropZone: multi2.dataset.dropZone === 'true',
            multi1HasGroup: !!multi1.dataset.sortableGroup,
            multi2HasGroup: !!multi2.dataset.sortableGroup,
            multi1Classes: Array.from(multi1.classList),
            multi2Classes: Array.from(multi2.classList),
            multi1Children: multi1.children.length,
            multi2Children: multi2.children.length,
          }

          // Check if items are actually draggable
          const items1 = Array.from(multi1.querySelectorAll('.horizontal-item'))
          const items2 = Array.from(multi2.querySelectorAll('.horizontal-item'))

          result.registryAccess.items1Draggable = items1.map(
            (item) => (item as HTMLElement).draggable
          )
          result.registryAccess.items2Draggable = items2.map(
            (item) => (item as HTMLElement).draggable
          )
        }
      } catch (e) {
        result.errors.push(`DragManager check error: ${e}`)
      }

      return result
    })

    console.log(
      'DragManager check results:',
      JSON.stringify(dragManagerCheck, null, 2)
    )

    // Try to trigger Sortable creation manually to see if it works
    const manualCreate = await page.evaluate(() => {
      const result = {
        success: false,
        error: null as any,
        instanceCreated: false,
        afterCreation: null as any,
      }

      try {
        // Try to import Sortable manually
        const Sortable = (window as any).Sortable
        if (!Sortable) {
          result.error = 'Sortable not available on window'
          return result
        }

        // Try to create an instance manually
        const testElement = document.createElement('div')
        testElement.id = 'test-sortable'
        document.body.appendChild(testElement)

        const instance = new Sortable(testElement, {
          group: 'test-group',
        })

        result.instanceCreated = !!instance
        result.success = true

        // Check if it was registered
        result.afterCreation = {
          hasInstance: Sortable.instances.has(testElement),
          canGetInstance: !!Sortable.instances.get(testElement),
          instanceType: typeof instance,
          elementHasDropZone: testElement.dataset.dropZone === 'true',
        }

        // Clean up
        instance.destroy()
        testElement.remove()
      } catch (e) {
        result.error = String(e)
      }

      return result
    })

    console.log('Manual creation test:', JSON.stringify(manualCreate, null, 2))

    // Basic assertions
    expect(accessCheck.scriptErrors.length).toBe(0)
    expect(dragManagerCheck.errors.length).toBe(0)

    if (accessCheck.importedSortable?.exists) {
      console.log('✅ Sortable class is accessible')
      expect(accessCheck.staticAccess?.multi1HasInstance).toBe(true)
      expect(accessCheck.staticAccess?.multi2HasInstance).toBe(true)
    } else {
      console.log('❌ Sortable class is not accessible - checking why...')

      // Check if it's a module loading issue
      if (!accessCheck.importedSortable) {
        console.log(
          'Sortable is not on window object - might be module scope issue'
        )
      }
    }

    if (manualCreate.success) {
      console.log('✅ Manual Sortable creation works')
      expect(manualCreate.instanceCreated).toBe(true)
    } else {
      console.log('❌ Manual Sortable creation failed:', manualCreate.error)
    }
  })
})
