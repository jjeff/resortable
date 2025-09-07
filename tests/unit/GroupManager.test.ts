import { describe, expect, it } from 'vitest'
import { GroupManager } from '../../src/core/GroupManager.js'

describe('GroupManager', () => {
  describe('Constructor and Basic Methods', () => {
    it('should create a group manager with string group name', () => {
      const groupManager = new GroupManager('test-group')
      expect(groupManager.getName()).toBe('test-group')
    })

    it('should create a group manager with group object', () => {
      const groupConfig = {
        name: 'shared-group',
        pull: 'clone' as const,
        put: true,
      }
      const groupManager = new GroupManager(groupConfig)
      expect(groupManager.getName()).toBe('shared-group')
      expect(groupManager.getConfig()).toEqual(groupConfig)
    })

    it('should use default group name when undefined', () => {
      const groupManager = new GroupManager(undefined)
      expect(groupManager.getName()).toBe('default')
    })
  })

  describe('Pull Configuration', () => {
    it('should allow pulling by default', () => {
      const groupManager = new GroupManager('test')
      expect(groupManager.canPull()).toBe(true)
    })

    it('should detect clone mode correctly', () => {
      const cloneGroup = new GroupManager({ name: 'clone', pull: 'clone' })
      expect(cloneGroup.shouldClone()).toBe(true)
      expect(cloneGroup.getPullMode('target')).toBe('clone')
    })

    it('should detect move mode correctly', () => {
      const moveGroup = new GroupManager({ name: 'move', pull: true })
      expect(moveGroup.shouldClone()).toBe(false)
      expect(moveGroup.getPullMode('target')).toBe('move')
    })

    it('should handle array pull configuration', () => {
      const restrictedGroup = new GroupManager({
        name: 'restricted',
        pull: ['allowed1', 'allowed2'],
      })
      expect(restrictedGroup.canPullTo('allowed1')).toBe(true)
      expect(restrictedGroup.canPullTo('allowed2')).toBe(true)
      expect(restrictedGroup.canPullTo('forbidden')).toBe(false)
    })

    it('should prevent pulling when pull is false', () => {
      const noPullGroup = new GroupManager({ name: 'no-pull', pull: false })
      expect(noPullGroup.canPull()).toBe(false)
      expect(noPullGroup.canPullTo('any')).toBe(false)
    })
  })

  describe('Put Configuration', () => {
    it('should allow putting by default', () => {
      const groupManager = new GroupManager('test')
      expect(groupManager.canPutFrom('any')).toBe(true)
    })

    it('should handle array put configuration', () => {
      const restrictedGroup = new GroupManager({
        name: 'restricted',
        put: ['source1', 'source2'],
      })
      expect(restrictedGroup.canPutFrom('source1')).toBe(true)
      expect(restrictedGroup.canPutFrom('source2')).toBe(true)
      expect(restrictedGroup.canPutFrom('forbidden')).toBe(false)
    })

    it('should prevent putting when put is false', () => {
      const noPutGroup = new GroupManager({ name: 'no-put', put: false })
      expect(noPutGroup.canPutFrom('any')).toBe(false)
    })
  })

  describe('Group Compatibility', () => {
    it('should consider same groups compatible', () => {
      const group1 = new GroupManager('same')
      const group2 = new GroupManager('same')
      expect(GroupManager.areCompatible(group1, group2)).toBe(true)
    })

    it('should check pull and put compatibility', () => {
      const sourceGroup = new GroupManager({
        name: 'source',
        pull: ['target'],
      })
      const targetGroup = new GroupManager({
        name: 'target',
        put: ['source'],
      })
      expect(GroupManager.areCompatible(sourceGroup, targetGroup)).toBe(true)
    })

    it('should reject incompatible groups', () => {
      const sourceGroup = new GroupManager({
        name: 'source',
        pull: ['other'],
      })
      const targetGroup = new GroupManager({
        name: 'target',
        put: ['other'],
      })
      expect(GroupManager.areCompatible(sourceGroup, targetGroup)).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when trying to pull to forbidden group', () => {
      const restrictedGroup = new GroupManager({
        name: 'restricted',
        pull: ['allowed'],
      })
      expect(() => restrictedGroup.getPullMode('forbidden')).toThrow(
        'Cannot pull from group "restricted" to group "forbidden"'
      )
    })
  })

  describe('Revert Clone Configuration', () => {
    it('should not revert clone by default', () => {
      const groupManager = new GroupManager('test')
      expect(groupManager.shouldRevertClone()).toBe(false)
    })

    it('should revert clone when configured', () => {
      const revertGroup = new GroupManager({
        name: 'revert',
        revertClone: true,
      })
      expect(revertGroup.shouldRevertClone()).toBe(true)
    })
  })
})
