import type { Task } from '@shared/types'

const listEl = document.getElementById('list') as HTMLDivElement
const titleEl = document.getElementById('new-title') as HTMLInputElement
const dueEl = document.getElementById('new-due') as HTMLInputElement
const addBtn = document.getElementById('add-btn') as HTMLButtonElement
const closeBtn = document.getElementById('close-btn') as HTMLButtonElement
const countEl = document.getElementById('count') as HTMLSpanElement

async function refresh(): Promise<void> {
  render(await window.syrup.tasks.list())
}

function render(tasks: Task[]): void {
  listEl.innerHTML = ''
  const open = tasks.filter((t) => t.status === 'todo')
  const done = tasks.filter((t) => t.status === 'done')

  if (!open.length && !done.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '目前沒有代辦~\n在上面打字，或跟小漿糖說「提醒我…」'
    listEl.appendChild(empty)
  }

  open.forEach((t) => listEl.appendChild(row(t)))

  if (done.length) {
    const sep = document.createElement('div')
    sep.className = 'sep'
    sep.textContent = `已完成 (${done.length})`
    listEl.appendChild(sep)
    done.forEach((t) => listEl.appendChild(row(t)))
  }

  countEl.textContent = open.length ? `還有 ${open.length} 項待辦` : done.length ? '全部完成 🎉' : ''
}

function row(t: Task): HTMLElement {
  const el = document.createElement('div')
  el.className = `task ${t.status}`

  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = t.status === 'done'
  cb.disabled = t.status === 'done'
  cb.addEventListener('change', () => void complete(t.id))

  const title = document.createElement('span')
  title.className = 'task-title'
  title.textContent = t.title

  const meta = document.createElement('span')
  meta.className = 'task-meta'
  if (t.status === 'todo' && t.dueAt) meta.textContent = '⏰ ' + fmtDue(t.dueAt)

  const del = document.createElement('button')
  del.className = 'del'
  del.textContent = '✕'
  del.title = '刪除'
  del.addEventListener('click', () => void remove(t.id))

  el.append(cb, title, meta, del)
  return el
}

function fmtDue(due: number): string {
  const mins = Math.round((due - Date.now()) / 60000)
  if (mins <= 0) return '到期'
  if (mins < 60) return `${mins} 分後`
  const d = new Date(due)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function add(): Promise<void> {
  const title = titleEl.value.trim()
  if (!title) return
  const due = Number(dueEl.value)
  await window.syrup.tasks.add(title, due > 0 ? due : undefined)
  titleEl.value = ''
  dueEl.value = ''
  titleEl.focus()
  await refresh()
}

async function complete(id: string): Promise<void> {
  await window.syrup.tasks.complete(id)
  await refresh()
}

async function remove(id: string): Promise<void> {
  await window.syrup.tasks.remove(id)
  await refresh()
}

addBtn.addEventListener('click', () => void add())
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void add()
})
closeBtn.addEventListener('click', () => window.syrup.window.close())
// Refresh when the list changes elsewhere (e.g. you told the pet in chat).
window.syrup.tasks.onUpdated(() => void refresh())

void refresh()
