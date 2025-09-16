# Spec Kit Setup for Resortable

This project has been configured with GitHub Spec Kit for Spec-Driven Development.

## What is Spec Kit?

Spec Kit is a tool for Spec-Driven Development that helps build high-quality software faster by allowing organizations to focus on product scenarios rather than writing undifferentiated code. It generates executable specifications that directly create working implementations.

## Directory Structure

```
├── specs/           # Feature specifications (one per feature)
├── templates/       # Spec Kit templates for specs, plans, and tasks
├── scripts/         # Automation scripts for feature management
├── memory/          # Project constitution and development guidelines
```

## Available Commands

### AI Assistant Commands (for GitHub Copilot)

- `/specify <feature description>` - Create a new feature specification
- `/plan` - Generate implementation plan from a specification
- `/tasks` - Generate actionable tasks from the implementation plan

### Manual Script Usage

```bash
# Create a new feature specification
./scripts/bash/create-new-feature.sh "Add drag and drop animations"

# Update agent context (for AI assistants)
./scripts/bash/update-agent-context.sh copilot
```

## Development Workflow

1. **Specify**: Use `/specify` to describe what you want to build (focus on WHAT and WHY, not HOW)
2. **Plan**: Use `/plan` to create technical implementation plans with architecture decisions
3. **Tasks**: Use `/tasks` to break down the plan into actionable development tasks
4. **Implement**: Execute the tasks following TDD principles

## Constitution

The project follows the Resortable Constitution defined in `memory/constitution.md`, which emphasizes:

- TypeScript-first development with strict types
- Test-Driven Development (TDD)
- API compatibility with original Sortable.js
- Modern build system (Vite + Rollup)
- Performance and accessibility standards

## Examples

See the `templates/` directory for examples of:
- Feature specifications (`spec-template.md`)
- Implementation plans (`plan-template.md`)
- Task breakdowns (`tasks-template.md`)

## Integration

This Spec Kit setup integrates with the existing Resortable project infrastructure:
- Uses the same TypeScript/ESLint/Prettier configuration
- Follows the established testing framework (Vitest + Playwright)
- Respects the current build system and CI/CD pipeline
- Maintains compatibility with existing documentation system