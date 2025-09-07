/**
 * AnimationManager - Coordinates smooth animations for drag and drop operations
 * using the FLIP (First, Last, Invert, Play) technique
 *
 * @internal
 */
export class AnimationManager {
  private animationDuration: number
  private easing: string
  private activeAnimations = new Map<HTMLElement, Animation>()

  constructor(options?: { animation?: number; easing?: string }) {
    this.animationDuration = options?.animation ?? 150
    this.easing = options?.easing ?? 'cubic-bezier(0.4, 0.0, 0.2, 1)' // Material Design easing
  }

  /**
   * Animate element reordering using FLIP technique
   * @param elements - Elements that are being reordered
   * @param callback - Function that performs the actual DOM reordering
   */
  public animateReorder(elements: HTMLElement[], callback: () => void): void {
    console.log(`[AnimationManager] animateReorder called with ${elements.length} elements, duration: ${this.animationDuration}ms`)
    if (this.animationDuration === 0) {
      // Skip animation if duration is 0
      console.log('[AnimationManager] Animation disabled (duration=0)')
      callback()
      return
    }

    // First: Capture initial positions
    const initialPositions = this.capturePositions(elements)
    console.log(`[AnimationManager] Captured ${initialPositions.size} initial positions`)

    // Last: Execute the DOM change
    callback()

    // Invert: Calculate the delta and apply inverse transform
    // Play: Animate back to neutral
    let animatedCount = 0
    elements.forEach((element) => {
      const initial = initialPositions.get(element)
      if (!initial) return

      const final = element.getBoundingClientRect()
      const deltaX = initial.left - final.left
      const deltaY = initial.top - final.top

      // Skip if element hasn't moved
      if (deltaX === 0 && deltaY === 0) return
      
      animatedCount++
      console.log(`[AnimationManager] Animating element ${animatedCount}: deltaX=${deltaX}, deltaY=${deltaY}`)

      // Cancel any existing animation on this element
      this.cancelAnimation(element)

      // Use Web Animations API for smooth FLIP animation
      try {
        const animation = element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' },
          ],
          {
            duration: this.animationDuration,
            easing: this.easing,
          }
        )

        this.activeAnimations.set(element, animation)
        console.log(`[AnimationManager] Started animation for element`)

        // Clean up after animation
        animation.addEventListener('finish', () => {
          console.log(`[AnimationManager] Animation finished`)
          this.activeAnimations.delete(element)
        })
      } catch (error) {
        console.error('[AnimationManager] Error creating animation:', error)
      }
    })
  }

  /**
   * Animate a ghost/placeholder element appearance
   * @param element - The ghost element to animate
   */
  public animateGhostIn(element: HTMLElement): void {
    if (this.animationDuration === 0) return

    element.style.opacity = '0'
    element.style.transform = 'scale(0.95)'

    // Force reflow
    element.offsetHeight // eslint-disable-line @typescript-eslint/no-unused-expressions

    element.style.transition = `
      opacity ${this.animationDuration / 2}ms ${this.easing},
      transform ${this.animationDuration / 2}ms ${this.easing}
    `
    element.style.opacity = '0.5'
    element.style.transform = 'scale(1)'
  }

  /**
   * Animate a ghost/placeholder element removal
   * @param element - The ghost element to animate out
   * @param callback - Callback when animation completes
   */
  public animateGhostOut(element: HTMLElement, callback?: () => void): void {
    if (this.animationDuration === 0) {
      callback?.()
      return
    }

    element.style.transition = `
      opacity ${this.animationDuration / 2}ms ${this.easing},
      transform ${this.animationDuration / 2}ms ${this.easing}
    `
    element.style.opacity = '0'
    element.style.transform = 'scale(0.95)'

    window.setTimeout(() => {
      callback?.()
    }, this.animationDuration / 2)
  }

  /**
   * Animate element insertion into a list
   * @param element - Element being inserted
   */
  public animateInsert(element: HTMLElement): void {
    if (this.animationDuration === 0) return

    // Start with element scaled down and transparent
    element.style.opacity = '0'
    element.style.transform = 'scale(0.8)'

    // Force reflow
    element.offsetHeight // eslint-disable-line @typescript-eslint/no-unused-expressions

    // Animate to full size and opacity
    element.style.transition = `
      opacity ${this.animationDuration}ms ${this.easing},
      transform ${this.animationDuration}ms ${this.easing}
    `
    element.style.opacity = '1'
    element.style.transform = 'scale(1)'

    // Clean up after animation
    window.setTimeout(() => {
      element.style.transition = ''
      element.style.transform = ''
      element.style.opacity = ''
    }, this.animationDuration)
  }

  /**
   * Animate element removal from a list
   * @param element - Element being removed
   * @param callback - Callback when animation completes
   */
  public animateRemove(element: HTMLElement, callback?: () => void): void {
    if (this.animationDuration === 0) {
      callback?.()
      return
    }

    element.style.transition = `
      opacity ${this.animationDuration}ms ${this.easing},
      transform ${this.animationDuration}ms ${this.easing}
    `
    element.style.opacity = '0'
    element.style.transform = 'scale(0.8)'

    window.setTimeout(() => {
      element.style.transition = ''
      element.style.transform = ''
      element.style.opacity = ''
      callback?.()
    }, this.animationDuration)
  }

  /**
   * Update animation settings
   */
  public updateOptions(options: { animation?: number; easing?: string }): void {
    if (options.animation !== undefined) {
      this.animationDuration = options.animation
    }
    if (options.easing !== undefined) {
      this.easing = options.easing
    }
  }

  /**
   * Cancel all active animations
   */
  public cancelAll(): void {
    this.activeAnimations.forEach((animation, element) => {
      animation.cancel()
      element.style.transform = ''
      element.style.transition = ''
    })
    this.activeAnimations.clear()
  }

  /**
   * Cancel animation for a specific element
   */
  private cancelAnimation(element: HTMLElement): void {
    const animation = this.activeAnimations.get(element)
    if (animation) {
      animation.cancel()
      element.style.transform = ''
      element.style.transition = ''
      this.activeAnimations.delete(element)
    }
  }

  /**
   * Capture positions of elements
   */
  private capturePositions(elements: HTMLElement[]): Map<HTMLElement, DOMRect> {
    const positions = new Map<HTMLElement, DOMRect>()
    elements.forEach((element) => {
      positions.set(element, element.getBoundingClientRect())
    })
    return positions
  }
}
