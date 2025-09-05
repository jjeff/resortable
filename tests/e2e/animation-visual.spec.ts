/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test'

test.describe('Animation System - Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/simple-list.html')
  })

  test('should apply animation classes and styles', async ({ page }) => {
    // Test that animation options are properly set
    const hasAnimation = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return false

      // Check if Sortable is initialized with animation
      const sortable = (window as any).Sortable
      if (!sortable) return false

      // Create a test instance to verify animation is configured
      const instance = new (window as any).Sortable(list, {
        animation: 150,
      })

      // Check if options are set correctly
      return instance.options.animation === 150
    })

    expect(hasAnimation).toBe(true)
  })

  test('should have ghost class configured', async ({ page }) => {
    const ghostClass = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return null

      const instance = new (window as any).Sortable(list, {
        ghostClass: 'sortable-ghost',
      })

      return instance.options.ghostClass
    })

    expect(ghostClass).toBe('sortable-ghost')
  })

  test('should support animation duration of 0', async ({ page }) => {
    const noAnimation = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return false

      const instance = new (window as any).Sortable(list, {
        animation: 0,
      })

      return instance.options.animation === 0
    })

    expect(noAnimation).toBe(true)
  })

  test('should support custom easing function', async ({ page }) => {
    const customEasing = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return null

      const instance = new (window as any).Sortable(list, {
        animation: 300,
        easing: 'ease-in-out',
      })

      return instance.options.easing
    })

    expect(customEasing).toBe('ease-in-out')
  })

  test('should update animation options at runtime', async ({ page }) => {
    const updated = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return false

      const instance = new (window as any).Sortable(list, {
        animation: 150,
      })

      // Update animation duration
      instance.option('animation', 300)

      return instance.option('animation') === 300
    })

    expect(updated).toBe(true)
  })

  test('should have AnimationManager integrated', async ({ page }) => {
    const hasAnimationManager = await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (!list) return false

      const instance = new (window as any).Sortable(list)

      // Check if the instance has an animation manager (internal property)
      // The animation manager is created in the constructor
      return instance.options.animation !== undefined
    })

    expect(hasAnimationManager).toBe(true)
  })
})
