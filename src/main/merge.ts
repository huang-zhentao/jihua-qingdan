import type { AppData, Project, Task } from '../renderer/src/domain/types'

const DAY = 86400000
const TOMBSTONE_TTL = 90 * DAY

function newer(a: { updatedAt?: string }, b: { updatedAt?: string }): boolean {
  return (a.updatedAt ?? '') > (b.updatedAt ?? '')
}

function newerOf<T extends { id: string; updatedAt?: string }>(a: T | undefined, b: T): T {
  if (!a) return b
  if ((a.updatedAt ?? '') === (b.updatedAt ?? '')) return a
  return newer(b, a) ? b : a
}

/**
 * 按记录合并两份数据：同 id 取 updatedAt 较新的那条。
 * 删除用墓碑（deletedAt）表示，所以「A 删除、B 编辑」时以时间较晚的一方为准。
 * 墓碑保留 90 天，过期后从两边一起清掉，避免文件无限增长。
 */
export function mergeDocs(local: AppData, remote: AppData): { doc: AppData; remoteChanged: boolean; localChanged: boolean } {
  const taskMap = new Map<string, Task>()
  for (const task of [...local.tasks, ...remote.tasks]) {
    taskMap.set(task.id, newerOf(taskMap.get(task.id), task))
  }

  const projectMap = new Map<string, Project>()
  for (const project of [...local.projects, ...remote.projects]) {
    projectMap.set(project.id, newerOf(projectMap.get(project.id), project))
  }

  const cutoff = Date.now() - TOMBSTONE_TTL
  const tasks = [...taskMap.values()].filter((t) => !t.deletedAt || new Date(t.deletedAt).getTime() > cutoff)
  const projects = [...projectMap.values()].filter((p) => !p.deletedAt || new Date(p.deletedAt).getTime() > cutoff)

  const doc: AppData = {
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    tasks,
    projects,
    settings: local.settings,
    meta: local.meta ?? remote.meta
  }

  const localChanged = serialize(doc) !== serialize(local)
  const remoteChanged = serialize(doc) !== serialize(remote)

  return { doc, localChanged, remoteChanged }
}

function serialize(doc: AppData): string {
  return JSON.stringify({
    tasks: [...doc.tasks].sort((a, b) => a.id.localeCompare(b.id)),
    projects: [...doc.projects].sort((a, b) => a.id.localeCompare(b.id)),
    settings: doc.settings
  })
}

/** 统计合并后仍然有效的任务数（不含墓碑） */
export function liveTaskCount(doc: AppData): number {
  return doc.tasks.filter((t) => !t.deletedAt).length
}
