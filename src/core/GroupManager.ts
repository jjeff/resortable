import { SortableGroup } from '../types/index.js'

/**
 * Manages group configuration and compatibility checking for Sortable instances
 * @internal
 */
export class GroupManager {
  private config: SortableGroup
  private name: string

  constructor(groupConfig: string | SortableGroup | undefined) {
    if (typeof groupConfig === 'string') {
      this.name = groupConfig
      this.config = { name: groupConfig }
    } else if (groupConfig && typeof groupConfig === 'object') {
      this.name = groupConfig.name
      this.config = groupConfig
    } else {
      this.name = 'default'
      this.config = { name: 'default' }
    }
  }

  /**
   * Get the group name
   */
  public getName(): string {
    return this.name
  }

  /**
   * Get the full group configuration
   */
  public getConfig(): SortableGroup {
    return this.config
  }

  /**
   * Check if items can be pulled from this group
   */
  public canPull(): boolean {
    const pull = this.config.pull
    return (
      pull === undefined ||
      pull === true ||
      pull === 'clone' ||
      Array.isArray(pull)
    )
  }

  /**
   * Check if this group should clone items when pulling (instead of moving)
   */
  public shouldClone(): boolean {
    return this.config.pull === 'clone'
  }

  /**
   * Check if items can be pulled to a specific target group
   * @param targetGroupName - The name of the target group
   */
  public canPullTo(targetGroupName: string): boolean {
    const pull = this.config.pull

    if (pull === false) return false
    if (pull === true || pull === 'clone') return true

    // For simple string groups (pull === undefined), allow pulling to the same group name
    // This enables cross-container drag between containers with the same group
    if (pull === undefined) {
      return targetGroupName === this.name
    }

    if (Array.isArray(pull)) {
      return pull.includes(targetGroupName)
    }

    return false
  }

  /**
   * Check if this group can accept items from another group
   * @param sourceGroupName - The name of the source group
   */
  public canPutFrom(sourceGroupName: string): boolean {
    const put = this.config.put

    if (put === false) return false
    if (put === true || put === undefined) return true

    if (Array.isArray(put)) {
      return put.includes(sourceGroupName)
    }

    return false
  }

  /**
   * Check if two groups are compatible for drag operations
   * @param sourceGroup - The source group manager
   * @param targetGroup - The target group manager
   */
  public static areCompatible(
    sourceGroup: GroupManager,
    targetGroup: GroupManager
  ): boolean {
    const sourceGroupName = sourceGroup.getName()
    const targetGroupName = targetGroup.getName()

    // Same group is always compatible
    if (sourceGroupName === targetGroupName) return true

    // Check if source can pull to target and target can put from source
    return (
      sourceGroup.canPullTo(targetGroupName) &&
      targetGroup.canPutFrom(sourceGroupName)
    )
  }

  /**
   * Determine the pull mode for a cross-group operation
   * @param targetGroupName - The target group name
   * @returns The pull mode: 'move' for normal movement, 'clone' for cloning
   */
  public getPullMode(targetGroupName: string): 'move' | 'clone' {
    if (!this.canPullTo(targetGroupName)) {
      throw new Error(
        `Cannot pull from group "${this.name}" to group "${targetGroupName}"`
      )
    }

    return this.shouldClone() ? 'clone' : 'move'
  }

  /**
   * Check if cloned elements should revert to original position when removed
   */
  public shouldRevertClone(): boolean {
    return this.config.revertClone === true
  }
}
