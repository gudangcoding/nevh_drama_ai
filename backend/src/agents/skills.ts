/**
 * Agent Workspace - Mastra native capability
 * Each Agent has one Workspace:
 * - filesystem: jailed to backend/workspace/, Agent gets file read/write tools
 * - skills: registers each Agent SKILL.md from workspace/skills/
 * When injecting instructions, full skill text is concatenated (native injection is metadata-only; full-text injection ensures consistent behavior)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Desktop injects WORKSPACE_PATH from Electron main process (writable copy in userData); dev uses backend/workspace as anchor
const WORKSPACE_DIR = process.env.WORKSPACE_PATH
  ? path.resolve(process.env.WORKSPACE_PATH)
  : path.resolve(__dirname, '../../workspace')
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills')

// Ensure work directory exists at startup (jail root for Agent file read/write)
  // After packaging, desktop module may be loaded from read-only location; failure should not block startup (route layer gives clear error)
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true })
  } catch (err) {
    console.warn(`[skills] Failed to create work directory (read-only environment?): ${(err as Error).message}`)
  }

/** Skill directories registered per Agent (relative to workspace/skills/, including sub-spec dirs; dir names must follow Agent Skills Spec: lowercase + hyphens) */
const AGENT_SKILL_MAP: Record<string, string[]> = {
  episode_expander: [],
  script_rewriter: ['script-rewriter'],
  extractor: ['extractor'],
  storyboard_breaker: ['storyboard-breaker'],
  prompt_generator: [
    'prompt-generator/character-prompt',
    'prompt-generator/scene-prompt',
    'prompt-generator/prop-prompt',
    'prompt-generator/video-prompt',
  ],
}

/** Workspace per Agent (filesystem work dir + native skill registration)
 *  Skills use dynamic resolver matching by directory prefix: new sub-skills created in settings can be discovered without restart */
export const skillWorkspaces: Record<string, Workspace> = Object.fromEntries(
  Object.entries(AGENT_SKILL_MAP).map(([agentType, prefixes]) => [
    agentType,
    new Workspace({
      id: `workspace-${agentType}`,
      name: `${agentType} workspace`,
      filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
      skills: () => scanSkillPaths().filter(p =>
        prefixes.some(prefix => p === `skills/${prefix}` || p.startsWith(`skills/${prefix}/`))),
    }),
  ]),
)

/** Recursively scan all directories containing SKILL.md under workspace/skills/ (paths relative to workspace root) */
function scanSkillPaths(): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (fs.existsSync(path.join(full, 'SKILL.md'))) found.push(`skills/${rel}`)
      walk(full, rel)
    }
  }
  walk(SKILLS_DIR, '')
  return found
}

/**
 * Skill Management Workspace (for settings page CRUD)
 * Skills use dynamic resolver; newly created/deleted skill dirs are discoverable without restart
 */
export const skillsManagerWorkspace = new Workspace({
  id: 'workspace-skills-manager',
  name: 'skills manager',
  filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
  skills: () => scanSkillPaths(),
})

function formatSkillSection(skillId: string, content: string): string {
  return [`## Skill: ${skillId}`, content].join('\n')
}

/** Strip frontmatter from SKILL.md-style file, return body (for direct reading by language variants) */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return (m ? raw.slice(m[0].length) : raw).trim()
}

/** Read skill language variant content (SKILL.<lang>.md, read directly bypassing cache for freshness); returns null if missing */
async function readLocalizedSkill(relPath: string, lang: string): Promise<string | null> {
  const fsm = skillsManagerWorkspace.filesystem!
  const p = `skills/${relPath}/SKILL.${lang}.md`
  try {
    if (!await fsm.exists(p)) return null
    const body = stripFrontmatter(String(await fsm.readFile(p, { encoding: 'utf-8' })))
    return body || null
  } catch {
    return null
  }
}

/** Read full skill text for an Agent (via workspace.skills API, preserving original injection format)
 *  AGENT_SKILL_MAP directories are matched by prefix: the directory itself and all SKILL.md in subdirectories are injected,
 *  so new sub-skills created in settings (e.g. storyboard-breaker/xxx) take effect without code changes.
 *  When lang is not zh, each skill prefers SKILL.<lang>.md, falls back to base version if missing */
export async function loadAgentSkills(agentType: string, lang?: string | null): Promise<string> {
  const workspace = skillWorkspaces[agentType]
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!workspace || !prefixes.length) return ''

  const allPaths = scanSkillPaths().map(p => p.replace(/^skills\//, ''))
  const relPaths = allPaths.filter(p =>
    prefixes.some(prefix => p === prefix || p.startsWith(prefix + '/')))

  const useLocalized = Boolean(lang && lang !== 'zh')
  const contents: string[] = []
  for (const relPath of relPaths) {
    let body: string | null | undefined
    if (useLocalized) body = await readLocalizedSkill(relPath, lang!)
    if (!body) {
      const skill = await workspace.skills?.get(`skills/${relPath}`)
      body = skill?.instructions?.trim()
    }
    if (body) contents.push(formatSkillSection(relPath, body))
  }

  if (!contents.length) return ''

  return [
    'The following are project skill specs (SKILL.md) specific to this Agent.',
    'Different Agents load different skills; you only need to follow the skills currently injected.',
    'You must prioritize following these specs without violating current tool boundaries; if they conflict with explicit user requirements, user requirements take precedence.',
    '',
    contents.join('\n\n'),
  ].join('\n')
}

/**
 * Force rescan of all Agent skills (called after editing SKILL.md)
 * maybeRefresh detects directory add/remove (dynamic resolver path changes), refresh handles content updates
 * (directory mtime does not update on file content edit, staleness detection relies on maybeRefresh)
 */
export async function refreshSkillWorkspaces(): Promise<void> {
  await Promise.all(
    [...Object.values(skillWorkspaces), skillsManagerWorkspace]
      .map(async workspace => {
        await workspace.skills?.maybeRefresh()
        await workspace.skills?.refresh()
      }),
  )
}
