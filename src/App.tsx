import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail } from './supabase'
import type { Profile, Task, TaskFormData, TaskPriority, TaskStatus } from './types'
import { addDays, formatDay, formatLongDay, formatWeekRange, isSameDay, startOfWeek, toIsoDate } from './date'

const USERS = Array.from({ length: 15 }, (_, index) => `IMP-${index + 1}`)
const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  task_date: toIsoDate(new Date()),
  start_time: '',
  end_time: '',
  status: 'scheduled',
  priority: 'normal',
  owner_id: '',
  assignee_ids: [],
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [view, setView] = useState<'day' | 'week' | 'mine'>('day')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, role, active')
      .eq('active', true)
      .order('username')
    if (error) throw error
    setProfiles((data || []) as Profile[])
  }, [])

  const loadCurrentProfile = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, role, active')
      .eq('id', session.user.id)
      .single()
    if (error) throw error
    setProfile(data as Profile)
  }, [session])

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const loadTasks = useCallback(async () => {
    if (!session) return
    const from = toIsoDate(weekStart)
    const to = toIsoDate(weekEnd)
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        owner:profiles!tasks_owner_id_fkey(id, username, role, active),
        task_assignees(profile:profiles(id, username, role, active))
      `)
      .is('deleted_at', null)
      .gte('task_date', from)
      .lte('task_date', to)
      .order('task_date')
      .order('start_time', { nullsFirst: true })
    if (error) throw error

    const mapped = (data || []).map((row: any) => ({
      ...row,
      assignees: (row.task_assignees || []).map((item: any) => item.profile).filter(Boolean),
    }))
    setTasks(mapped as Task[])
  }, [session, weekStart, weekEnd])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setTasks([])
      return
    }
    Promise.all([loadCurrentProfile(), loadProfiles(), loadTasks()]).catch((error) => {
      setMessage(error.message || 'Could not load data.')
    })
  }, [session, loadCurrentProfile, loadProfiles, loadTasks])

  useEffect(() => {
    if (!session) return

    const syncToCurrentDate = () => {
      const today = new Date()
      setSelectedDate((current) => isSameDay(current, today) ? current : today)
      loadTasks().catch((error) => setMessage(error.message || 'Could not refresh tasks.'))
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncToCurrentDate()
    }

    window.addEventListener('focus', syncToCurrentDate)
    document.addEventListener('visibilitychange', handleVisibility)

    const dateCheckTimer = window.setInterval(syncToCurrentDate, 60_000)

    return () => {
      window.removeEventListener('focus', syncToCurrentDate)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(dateCheckTimer)
    }
  }, [session, loadTasks])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('weekly-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, loadTasks)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, loadTasks])

  function openNew(date = selectedDate) {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      task_date: toIsoDate(date),
      owner_id: profile?.id || '',
      assignee_ids: profile?.id ? [profile.id] : [],
    })
    setFormOpen(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setForm({
      title: task.title,
      description: task.description || '',
      task_date: task.task_date,
      start_time: task.start_time?.slice(0, 5) || '',
      end_time: task.end_time?.slice(0, 5) || '',
      status: task.status,
      priority: task.priority,
      owner_id: task.owner_id || '',
      assignee_ids: task.assignees?.map((item) => item.id) || [],
    })
    setFormOpen(true)
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault()
    if (!profile || saving) return
    setMessage('')
    if (!form.title.trim()) {
      setMessage('Title is required.')
      return
    }
    if (form.end_time && form.start_time && form.end_time <= form.start_time) {
      setMessage('End time must be later than start time.')
      return
    }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      task_date: form.task_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      status: form.status,
      priority: form.priority,
      owner_id: form.owner_id || null,
    }

    try {
      let taskId = editing?.id
      if (editing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .insert({ ...payload, created_by: profile.id })
          .select('id')
          .single()
        if (error) throw error
        taskId = data.id
      }

      if (!taskId) throw new Error('Task could not be saved.')
      const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', taskId)
      if (deleteError) throw deleteError

      if (form.assignee_ids.length) {
        const { error: insertError } = await supabase.from('task_assignees').insert(
          form.assignee_ids.map((profileId) => ({ task_id: taskId, profile_id: profileId })),
        )
        if (insertError) throw insertError
      }

      await loadTasks()
      setFormOpen(false)
      setMessage(editing ? 'Task updated.' : 'Task created.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Task could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function quickStatus(task: Task, status: TaskStatus) {
    const previousStatus = task.status
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item))

    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id)
    if (error) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: previousStatus } : item))
      setMessage(error.message)
      return
    }
    setMessage('Task updated.')
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Move "${task.title}" to trash?`)) return

    // Optimistic update: remove the card immediately instead of waiting for Realtime/refetch.
    setTasks((current) => current.filter((item) => item.id !== task.id))

    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), deleted_by: profile?.id })
      .eq('id', task.id)

    if (error) {
      await loadTasks()
      setMessage(error.message)
      return
    }
    setMessage('Task moved to trash.')
  }

  if (loading) return <div className="splash">Loading…</div>
  if (!session) return <Login users={USERS} />

  const dayTasks = tasks.filter((task) => task.task_date === toIsoDate(selectedDate))
  const mine = tasks.filter(
    (task) => task.owner_id === profile?.id || task.assignees?.some((item) => item.id === profile?.id),
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">IMP WEEKLY BOARD</div>
          <h1>{view === 'day' ? formatLongDay(selectedDate) : view === 'week' ? formatWeekRange(weekStart, weekEnd) : 'My Tasks'}</h1>
        </div>
        <button className="icon-button" onClick={() => supabase.auth.signOut()} aria-label="Sign out">
          <LogOut size={20} />
        </button>
      </header>

      {message && (
        <div className="notice">
          <CircleAlert size={18} />
          <span>{message}</span>
          <button onClick={() => setMessage('')}><X size={18} /></button>
        </div>
      )}

      {view !== 'mine' && (
        <div className="date-nav">
          <button onClick={() => setSelectedDate(addDays(selectedDate, view === 'week' ? -7 : -1))}>
            <ChevronLeft />
          </button>
          <button className="today-button" onClick={() => setSelectedDate(new Date())}>Today</button>
          <button onClick={() => setSelectedDate(addDays(selectedDate, view === 'week' ? 7 : 1))}>
            <ChevronRight />
          </button>
        </div>
      )}

      <main>
        {view === 'day' && (
          <TaskList tasks={dayTasks} onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
        )}

        {view === 'week' && (
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, index) => {
              const date = addDays(weekStart, index)
              const items = tasks.filter((task) => task.task_date === toIsoDate(date))
              return (
                <section className={`day-section ${isSameDay(date, new Date()) ? 'is-today' : ''}`} key={toIsoDate(date)}>
                  <button className="day-heading" onClick={() => { setSelectedDate(date); setView('day') }}>
                    <span>{formatDay(date)}{isSameDay(date, new Date()) && <em>Today</em>}</span>
                    <strong>{items.length}</strong>
                  </button>
                  <TaskList tasks={items} compact onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
                  <button className="add-inline" onClick={() => openNew(date)}><Plus size={17} /> Add task</button>
                </section>
              )
            })}
          </div>
        )}

        {view === 'mine' && (
          <TaskList tasks={mine} onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
        )}
      </main>

      <button className="fab" onClick={() => openNew()} aria-label="Add task"><Plus /></button>

      <nav className="bottom-nav">
        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>
          <CalendarDays size={20} /><span>Today</span>
        </button>
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
          <RefreshCw size={20} /><span>Week</span>
        </button>
        <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
          <UserRound size={20} /><span>My Tasks</span>
        </button>
      </nav>

      {formOpen && (
        <TaskModal
          form={form}
          setForm={setForm}
          profiles={profiles}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={saveTask}
          saving={saving}
        />
      )}
    </div>
  )
}

function Login({ users }: { users: string[] }) {
  const [username, setUsername] = useState(() => localStorage.getItem('imp-last-user') || 'IMP-1')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: pin,
    })
    if (loginError) {
      setError('Incorrect user or PIN.')
    } else {
      localStorage.setItem('imp-last-user', username)
    }
    setBusy(false)
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="app-mark">IMP</div>
        <h1>Weekly Board</h1>
        <p>Sign in with your user number and 6-digit PIN.</p>
        <label>
          User
          <select value={username} onChange={(e) => setUsername(e.target.value)}>
            {users.map((user) => <option key={user}>{user}</option>)}
          </select>
        </label>
        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy || pin.length !== 6}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}

function TaskList({
  tasks,
  compact = false,
  onEdit,
  onStatus,
  onDelete,
}: {
  tasks: Task[]
  compact?: boolean
  onEdit: (task: Task) => void
  onStatus: (task: Task, status: TaskStatus) => void
  onDelete: (task: Task) => void
}) {
  if (!tasks.length) return <div className="empty-state">No tasks scheduled.</div>
  return (
    <div className="task-list">
      {tasks.map((task) => (
        <article className={`task-card status-${task.status}`} key={task.id}>
          <button className="task-main" onClick={() => onEdit(task)}>
            <div className="task-topline">
              <span className={`priority priority-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
              <span className="time">{task.start_time ? task.start_time.slice(0, 5) : 'All day'}</span>
            </div>
            <h2>{task.title}</h2>
            {!compact && task.description && <p>{task.description}</p>}
            <div className="task-meta">
              <span>{STATUS_LABELS[task.status]}</span>
              <span>{task.assignees?.map((item) => item.username).join(', ') || 'Unassigned'}</span>
            </div>
          </button>
          <div className="quick-actions">
            {task.status !== 'in_progress' && task.status !== 'completed' && (
              <button onClick={() => onStatus(task, 'in_progress')}>Start</button>
            )}
            {task.status !== 'completed' && (
              <button onClick={() => onStatus(task, 'completed')}><Check size={16} /> Complete</button>
            )}
            <button className="danger-link" onClick={() => onDelete(task)} aria-label="Delete task">
              <Trash2 size={17} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function TaskModal({
  form,
  setForm,
  profiles,
  editing,
  onClose,
  onSubmit,
  saving,
}: {
  form: TaskFormData
  setForm: (next: TaskFormData) => void
  profiles: Profile[]
  editing: Task | null
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  saving: boolean
}) {
  function toggleAssignee(id: string) {
    const included = form.assignee_ids.includes(id)
    setForm({
      ...form,
      assignee_ids: included
        ? form.assignee_ids.filter((item) => item !== id)
        : [...form.assignee_ids, id],
    })
  }

  return (
    <div className="modal-backdrop">
      <form className="task-modal" onSubmit={onSubmit}>
        <header>
          <h2>{editing ? 'Edit Task' : 'Add Task'}</h2>
          <button type="button" onClick={onClose}><X /></button>
        </header>

        <label>
          Title *
          <input
            maxLength={60}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <small>{form.title.length}/60</small>
        </label>

        <label>
          Description
          <textarea
            maxLength={300}
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <small>{form.description.length}/300</small>
        </label>

        <div className="form-grid">
          <label>
            Date *
            <input type="date" value={form.task_date} onChange={(e) => setForm({ ...form, task_date: e.target.value })} required />
          </label>
          <label>
            Start Time
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </label>
          <label>
            End Time
            <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </label>
          <label>
            Owner
            <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
              <option value="">No owner</option>
              {profiles.map((item) => <option key={item.id} value={item.id}>{item.username}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Assigned Users</legend>
          <div className="assignee-grid">
            {profiles.map((item) => (
              <label className="check-label" key={item.id}>
                <input
                  type="checkbox"
                  checked={form.assignee_ids.includes(item.id)}
                  onChange={() => toggleAssignee(item.id)}
                />
                <span>{item.username}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <footer>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Task'}</button>
        </footer>
      </form>
    </div>
  )
}

export default App
