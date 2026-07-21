import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  LayoutGrid,
  Clock3,
  UsersRound,
  LogOut,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  ArchiveRestore,
  Trash2,
  UserRound,
  Palmtree,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, usernameToEmail } from './supabase'
import type { LeaveFormData, LeavePeriod, Profile, Task, TaskFormData, TaskKind, TaskPriority, TaskStatus } from './types'
import { addDays, formatDay, formatLongDay, formatWeekRange, isSameDay, startOfWeek, toIsoDate } from './date'

const USERS = Array.from({ length: 15 }, (_, index) => `IMP-${index + 1}`)
const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  task_date: toIsoDate(new Date()),
  end_date: toIsoDate(new Date()),
  start_time: '',
  end_time: '',
  status: 'scheduled',
  priority: 'normal',
  task_kind: 'task',
  owner_id: '',
  assignee_ids: [],
}

const EMPTY_LEAVE: LeaveFormData = { profile_id: '', leave_type: 'annual', start_date: toIsoDate(new Date()), end_date: toIsoDate(new Date()), note: '' }

const LEAVE_LABELS = { annual: 'Annual leave', sick: 'Sick leave', training: 'Training', other: 'Other absence' } as const

const STATUS_LABELS: Record<TaskStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
}

const TASK_KIND_LABELS: Record<TaskKind, string> = { task: 'Task', duty: 'Duty', standby: 'Stand By' }

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
  const [personalTasks, setPersonalTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [view, setView] = useState<'day' | 'week' | 'mine' | 'board' | 'leave'>('day')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [adminTasks, setAdminTasks] = useState<Task[]>([])
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [leavePeriods, setLeavePeriods] = useState<LeavePeriod[]>([])
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [editingLeave, setEditingLeave] = useState<LeavePeriod | null>(null)
  const [leaveForm, setLeaveForm] = useState<LeaveFormData>(EMPTY_LEAVE)
  const [filter, setFilter] = useState<'all' | 'mine' | 'today' | 'overdue' | 'done'>('all')

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

  const loadPersonalTasks = useCallback(async () => {
    if (!session) {
      setPersonalTasks([])
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        owner:profiles!tasks_owner_id_fkey(id, username, role, active),
        task_assignees(profile:profiles(id, username, role, active))
      `)
      .is('deleted_at', null)
      .order('task_date')
      .order('start_time', { nullsFirst: true })

    if (error) throw error
    const mapped = (data || []).map((row: any) => ({
      ...row,
      assignees: (row.task_assignees || []).map((item: any) => item.profile).filter(Boolean),
    }))
    setPersonalTasks(mapped as Task[])
  }, [session])

  const loadAdminTasks = useCallback(async () => {
    if (!session || profile?.role !== 'admin') {
      setAdminTasks([])
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        description,
        task_date,
        end_date,
        start_time,
        end_time,
        status,
        priority,
        task_kind,
        owner_id,
        created_by,
        created_at,
        updated_at,
        deleted_at,
        owner:profiles!tasks_owner_id_fkey(id, username, role, active),
        task_assignees(profile:profiles(id, username, role, active))
      `)
      .is('deleted_at', null)
      .order('task_date')

    if (error) throw error

    const mapped = (data || []).map((row: any) => ({
      ...row,
      assignees: (row.task_assignees || []).map((item: any) => item.profile).filter(Boolean),
    }))
    setAdminTasks(mapped as Task[])
  }, [session, profile?.role])

  const loadArchivedTasks = useCallback(async () => {
    if (!session || profile?.role !== 'admin') {
      setArchivedTasks([])
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        owner:profiles!tasks_owner_id_fkey(id, username, role, active),
        task_assignees(profile:profiles(id, username, role, active))
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) throw error
    const mapped = (data || []).map((row: any) => ({
      ...row,
      assignees: (row.task_assignees || []).map((item: any) => item.profile).filter(Boolean),
    }))
    setArchivedTasks(mapped as Task[])
  }, [session, profile?.role])

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
      .lte('task_date', to)
      .gte('end_date', from)
      .order('task_date')
      .order('start_time', { nullsFirst: true })
    if (error) throw error

    const mapped = (data || []).map((row: any) => ({
      ...row,
      assignees: (row.task_assignees || []).map((item: any) => item.profile).filter(Boolean),
    }))
    setTasks(mapped as Task[])
  }, [session, weekStart, weekEnd])


  const loadLeavePeriods = useCallback(async () => {
    if (!session) { setLeavePeriods([]); return }
    // The dedicated Leave tab must show every leave record, not only records
    // overlapping the currently selected week. Day/week views filter this
    // complete list locally for the date being displayed.
    const { data, error } = await supabase
      .from('leave_periods')
      .select('*, profile:profiles!leave_periods_profile_id_fkey(id, username, role, active)')
      .order('start_date')
    if (error) throw error
    setLeavePeriods((data || []) as LeavePeriod[])
  }, [session])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setTasks([])
      return
    }
    Promise.all([loadCurrentProfile(), loadProfiles(), loadTasks(), loadPersonalTasks(), loadLeavePeriods()]).catch((error) => {
      setMessage(error.message || 'Could not load data.')
    })
  }, [session, loadCurrentProfile, loadProfiles, loadTasks, loadPersonalTasks, loadLeavePeriods])


  useEffect(() => {
    if (profile?.role !== 'admin') {
      setAdminTasks([])
      return
    }
    Promise.all([loadAdminTasks(), loadArchivedTasks()]).catch((error) => setMessage(error.message || 'Could not load admin data.'))
  }, [profile?.role, loadAdminTasks, loadArchivedTasks])

  useEffect(() => {
    if (!session) return

    const syncToCurrentDate = () => {
      const today = new Date()
      setSelectedDate((current) => isSameDay(current, today) ? current : today)
      Promise.all([loadTasks(), loadPersonalTasks(), loadLeavePeriods()]).catch((error) => setMessage(error.message || 'Could not refresh tasks.'))
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
  }, [session, loadTasks, loadPersonalTasks, loadLeavePeriods])

  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('weekly-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks()
        loadPersonalTasks()
        if (profile?.role === 'admin') { loadAdminTasks(); loadArchivedTasks() }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_periods' }, () => { loadLeavePeriods() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => {
        loadTasks()
        loadPersonalTasks()
        if (profile?.role === 'admin') { loadAdminTasks(); loadArchivedTasks() }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, profile?.role, loadTasks, loadPersonalTasks, loadAdminTasks, loadArchivedTasks, loadLeavePeriods])

  function openNew(date = selectedDate) {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      task_date: toIsoDate(date),
      end_date: toIsoDate(date),
      owner_id: profile?.id || '',
      assignee_ids: profile?.id ? [profile.id] : [],
    })
    setFormOpen(true)
  }

  function openNewFor(target: Profile, date: Date) {
    setEditing(null)
    const iso = toIsoDate(date)
    setForm({
      ...EMPTY_FORM,
      task_date: iso,
      end_date: iso,
      owner_id: target.id,
      assignee_ids: [target.id],
    })
    setFormOpen(true)
  }

  function openEdit(task: Task) {
    setEditing(task)
    setForm({
      title: task.title,
      description: task.description || '',
      task_date: task.task_date,
      end_date: task.end_date || task.task_date,
      start_time: task.start_time?.slice(0, 5) || '',
      end_time: task.end_time?.slice(0, 5) || '',
      status: task.status,
      priority: task.priority,
      task_kind: task.task_kind || 'task',
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
    if (form.end_date < form.task_date) { setMessage('End date cannot be before start date.'); return }
    if (form.end_date === form.task_date && form.end_time && form.start_time && form.end_time <= form.start_time) {
      setMessage('For a same-day task, end time must be later than start time.')
      return
    }
    if (form.task_kind !== 'task') {
      const opposite: TaskKind = form.task_kind === 'duty' ? 'standby' : 'duty'
      const selectedPeople = new Set([form.owner_id, ...form.assignee_ids].filter(Boolean))
      const conflict = personalTasks.some((task) => {
        if (editing && task.id === editing.id) return false
        if (task.task_kind !== opposite || task.deleted_at) return false
        const overlaps = task.task_date <= form.end_date && task.end_date >= form.task_date
        const taskPeople = new Set([task.owner_id, ...(task.assignees || []).map((item) => item.id)].filter(Boolean) as string[])
        return overlaps && [...selectedPeople].some((id) => taskPeople.has(id))
      })
      if (conflict) {
        setMessage('Duty and Stand By cannot be assigned to the same person on the same day.')
        return
      }
    }

    setSaving(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      task_date: form.task_date,
      end_date: form.end_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      status: form.status,
      priority: form.priority,
      task_kind: form.task_kind,
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
      setMessage(editing ? 'Task changes saved.' : 'Task created.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Task could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function openLeave(date = selectedDate) {
    const iso = toIsoDate(date)
    setEditingLeave(null)
    setLeaveForm({ ...EMPTY_LEAVE, profile_id: profile?.id || '', start_date: iso, end_date: iso })
    setLeaveOpen(true)
  }

  function editLeave(leave: LeavePeriod) {
    setEditingLeave(leave)
    setLeaveForm({
      profile_id: leave.profile_id,
      leave_type: leave.leave_type,
      start_date: leave.start_date,
      end_date: leave.end_date,
      note: leave.note || '',
    })
    setLeaveOpen(true)
  }

  async function saveLeave(event: FormEvent) {
    event.preventDefault()
    if (!profile || saving) return
    if (!leaveForm.profile_id) { setMessage('Select an employee.'); return }
    if (leaveForm.end_date < leaveForm.start_date) { setMessage('Leave end date cannot be before start date.'); return }
    setSaving(true)
    const payload = {
      profile_id: leaveForm.profile_id,
      leave_type: leaveForm.leave_type,
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      note: leaveForm.note.trim() || null,
    }
    const { error } = editingLeave
      ? await supabase.from('leave_periods').update(payload).eq('id', editingLeave.id)
      : await supabase.from('leave_periods').insert({ ...payload, created_by: profile.id })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    await loadLeavePeriods()
    setLeaveOpen(false)
    setEditingLeave(null)
    setMessage(editingLeave ? 'Leave period updated.' : 'Leave period created.')
  }

  async function deleteLeave(leave: LeavePeriod) {
    if (profile?.role !== 'admin') return
    const employee = leave.profile?.username || 'this employee'
    if (!window.confirm(`Delete leave for ${employee} (${leave.start_date} to ${leave.end_date})?`)) return

    const previous = leavePeriods
    setLeavePeriods((current) => current.filter((item) => item.id !== leave.id))
    const { error } = await supabase.from('leave_periods').delete().eq('id', leave.id)
    if (error) {
      setLeavePeriods(previous)
      setMessage(error.message)
      return
    }
    setMessage('Leave period deleted.')
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

  async function restoreTask(task: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', task.id)
    if (error) {
      setMessage(error.message)
      return
    }
    setArchivedTasks((current) => current.filter((item) => item.id !== task.id))
    await Promise.all([loadTasks(), loadAdminTasks()])
    setMessage('Task restored.')
  }

  async function permanentlyDeleteTask(task: Task) {
    if (!window.confirm(`Permanently delete "${task.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      setMessage(error.message)
      return
    }
    setArchivedTasks((current) => current.filter((item) => item.id !== task.id))
    setMessage('Task permanently deleted.')
  }

  if (loading) return <div className="splash">Loading…</div>
  if (!session) return <Login users={USERS} />

  const todayIso = toIsoDate(new Date())
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = !normalizedQuery || [
      task.title,
      task.description || '',
      task.owner?.username || '',
      ...(task.assignees?.map((item) => item.username) || []),
    ].some((value) => value.toLowerCase().includes(normalizedQuery))

    if (!matchesSearch) return false
    if (filter === 'mine') return task.owner_id === profile?.id || task.assignees?.some((item) => item.id === profile?.id)
    if (filter === 'today') return task.task_date <= todayIso && task.end_date >= todayIso
    if (filter === 'overdue') return !['completed', 'cancelled'].includes(task.status) && task.end_date < todayIso
    if (filter === 'done') return task.status === 'completed'
    return true
  })
  const selectedIso = toIsoDate(selectedDate)
  const dayTasks = filteredTasks.filter((task) => task.task_date <= selectedIso && task.end_date >= selectedIso)
  const dayLeaves = leavePeriods.filter((leave) => leave.start_date <= selectedIso && leave.end_date >= selectedIso)
  const mine = filteredTasks.filter(
    (task) => task.owner_id === profile?.id || task.assignees?.some((item) => item.id === profile?.id),
  )
  const myVisibleTasks = personalTasks.filter(
    (task) => task.owner_id === profile?.id || task.assignees?.some((item) => item.id === profile?.id),
  )
  const myDayStats = {
    today: myVisibleTasks.filter((task) => task.task_date <= todayIso && task.end_date >= todayIso && !['completed', 'cancelled'].includes(task.status)).length,
    overdue: myVisibleTasks.filter((task) => task.end_date < todayIso && !['completed', 'cancelled'].includes(task.status)).length,
    completedToday: myVisibleTasks.filter((task) => task.task_date <= todayIso && task.end_date >= todayIso && task.status === 'completed').length,
    nextTask: myVisibleTasks
      .filter((task) => task.task_date >= todayIso && !['completed', 'cancelled'].includes(task.status))
      .sort((a, b) => `${a.task_date} ${a.start_time || '23:59'}`.localeCompare(`${b.task_date} ${b.start_time || '23:59'}`))[0] || null,
  }
  const adminStats = profile?.role === 'admin' ? {
    active: adminTasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length,
    completedToday: adminTasks.filter((task) => task.status === 'completed' && task.task_date === todayIso).length,
    overdue: adminTasks.filter((task) => !['completed', 'cancelled'].includes(task.status) && task.end_date < todayIso).length,
    thisWeek: tasks.length,
  } : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">IMP WEEKLY BOARD</div>
          <h1>{view === 'day' ? formatLongDay(selectedDate) : view === 'week' ? formatWeekRange(weekStart, weekEnd) : view === 'mine' ? 'My Tasks' : view === 'board' ? `Board · ${formatWeekRange(weekStart, weekEnd)}` : 'Leave'}</h1>
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

      {(view === 'day' || view === 'week' || view === 'board') && (
        <div className="date-nav">
          <button onClick={() => setSelectedDate(addDays(selectedDate, view === 'week' || view === 'board' ? -7 : -1))}>
            <ChevronLeft />
          </button>
          <button className="today-button" onClick={() => setSelectedDate(new Date())}>Today</button>
          <button onClick={() => setSelectedDate(addDays(selectedDate, view === 'week' || view === 'board' ? 7 : 1))}>
            <ChevronRight />
          </button>
        </div>
      )}

      {profile && view !== 'leave' && view !== 'board' && <MyDayDashboard username={profile.username} stats={myDayStats} />}

      {adminStats && view !== 'leave' && view !== 'board' && (
        <AdminDashboard
          stats={adminStats}
          profiles={profiles}
          weekTasks={tasks}
        />
      )}

      {view !== 'leave' && view !== 'board' && <section className="task-tools" aria-label="Task filters">
        <label className="search-box">
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tasks..."
            aria-label="Search tasks"
          />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={16} /></button>}
        </label>
        <div className="filter-chips">
          {([
            ['all', 'All'],
            ['mine', 'Mine'],
            ['today', 'Today'],
            ['overdue', 'Overdue'],
            ['done', 'Done'],
          ] as const).map(([value, label]) => (
            <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
          {profile?.role === 'admin' && (
            <button className="archive-button" onClick={() => setArchiveOpen(true)}>
              <ArchiveRestore size={15} /> Archive {archivedTasks.length ? `(${archivedTasks.length})` : ''}
            </button>
          )}
        </div>
      </section>}

      <main>
        {view === 'day' && (<>
          <LeaveList leaves={dayLeaves} />
          <TaskList tasks={dayTasks} selectedDate={selectedIso} onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
        </>)}

        {view === 'week' && (
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, index) => {
              const date = addDays(weekStart, index)
              const dateIso = toIsoDate(date)
              const items = filteredTasks.filter((task) => task.task_date <= dateIso && task.end_date >= dateIso)
              const leaves = leavePeriods.filter((leave) => leave.start_date <= dateIso && leave.end_date >= dateIso)
              return (
                <section className={`day-section ${isSameDay(date, new Date()) ? 'is-today' : ''}`} key={toIsoDate(date)}>
                  <button className="day-heading" onClick={() => { setSelectedDate(date); setView('day') }}>
                    <span>{formatDay(date)}{isSameDay(date, new Date()) && <em>Today</em>}</span>
                    <strong>{items.length}</strong>
                  </button>
                  <LeaveList leaves={leaves} compact />
                    <TaskList tasks={items} selectedDate={dateIso} compact onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
                  <button className="add-inline" onClick={() => openNew(date)}><Plus size={17} /> Add task</button>
                </section>
              )
            })}
          </div>
        )}

        {view === 'mine' && (
          <TaskList tasks={mine} onEdit={openEdit} onStatus={quickStatus} onDelete={removeTask} />
        )}

        {view === 'board' && (
          <PlanningBoard
            profiles={profiles}
            tasks={tasks}
            leaves={leavePeriods}
            weekStart={weekStart}
            onAssign={openNewFor}
            onEdit={openEdit}
          />
        )}

        {view === 'leave' && (
          <LeavePage leaves={leavePeriods} onAdd={() => openLeave()} onEdit={editLeave} onDelete={deleteLeave} canDelete={profile?.role === 'admin'} />
        )}
      </main>

      <div className="fab-stack">{view === 'board' ? null : view === 'leave' ? <button className="fab leave-fab" onClick={() => openLeave()} aria-label="Add leave"><Palmtree /></button> : <button className="fab" onClick={() => openNew()} aria-label="Add task"><Plus /></button>}</div>

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
        <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
          <LayoutGrid size={20} /><span>Board</span>
        </button>
        <button className={view === 'leave' ? 'active' : ''} onClick={() => setView('leave')}>
          <Palmtree size={20} /><span>Leave</span>
        </button>
      </nav>

      {archiveOpen && (
        <ArchiveModal
          tasks={archivedTasks}
          onClose={() => setArchiveOpen(false)}
          onRestore={restoreTask}
          onDelete={permanentlyDeleteTask}
        />
      )}

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

      {leaveOpen && <LeaveModal form={leaveForm} setForm={setLeaveForm} profiles={profiles} editing={Boolean(editingLeave)} onClose={() => { setLeaveOpen(false); setEditingLeave(null) }} onSubmit={saveLeave} saving={saving} />}
    </div>
  )
}

function MyDayDashboard({
  username,
  stats,
}: {
  username: string
  stats: { today: number; overdue: number; completedToday: number; nextTask: Task | null }
}) {
  const nextLabel = stats.nextTask
    ? `${stats.nextTask.task_date === toIsoDate(new Date()) ? 'Today' : stats.nextTask.task_date}${stats.nextTask.start_time ? ` · ${stats.nextTask.start_time.slice(0, 5)}` : ''}`
    : 'No upcoming tasks'

  return (
    <section className="my-day-dashboard" aria-label="My day summary">
      <div className="dashboard-heading">
        <div>
          <span>MY DAY</span>
          <h2>Hello, {username}</h2>
        </div>
        <CalendarDays size={22} />
      </div>
      <div className="my-day-grid">
        <div className="my-day-stat">
          <CalendarDays size={18} />
          <strong>{stats.today}</strong>
          <span>Today</span>
        </div>
        <div className={`my-day-stat ${stats.overdue ? 'stat-warning' : ''}`}>
          <Clock3 size={18} />
          <strong>{stats.overdue}</strong>
          <span>Overdue</span>
        </div>
        <div className="my-day-stat">
          <Check size={18} />
          <strong>{stats.completedToday}</strong>
          <span>Done today</span>
        </div>
      </div>
      <div className="next-task-card">
        <div>
          <span>NEXT TASK</span>
          <strong>{stats.nextTask?.title || 'You are clear'}</strong>
          <small>{nextLabel}</small>
        </div>
        <ChevronRight size={20} />
      </div>
    </section>
  )
}

function AdminDashboard({
  stats,
  profiles,
  weekTasks,
}: {
  stats: { active: number; completedToday: number; overdue: number; thisWeek: number }
  profiles: Profile[]
  weekTasks: Task[]
}) {
  const tasksPerEmployee = profiles
    .map((person) => ({
      username: person.username,
      count: weekTasks.filter(
        (task) => task.owner_id === person.id || task.assignees?.some((assignee) => assignee.id === person.id),
      ).length,
    }))
    .filter((person) => person.count > 0)
    .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username))

  return (
    <section className="admin-dashboard" aria-label="Administrator summary">
      <div className="dashboard-heading">
        <div>
          <span>ADMIN SUMMARY</span>
          <h2>Team overview</h2>
        </div>
        <UsersRound size={22} />
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <ClipboardList size={19} />
          <strong>{stats.active}</strong>
          <span>Active</span>
        </div>
        <div className="stat-card">
          <Check size={19} />
          <strong>{stats.completedToday}</strong>
          <span>Done today</span>
        </div>
        <div className={`stat-card ${stats.overdue ? 'stat-warning' : ''}`}>
          <Clock3 size={19} />
          <strong>{stats.overdue}</strong>
          <span>Overdue</span>
        </div>
        <div className="stat-card">
          <CalendarDays size={19} />
          <strong>{stats.thisWeek}</strong>
          <span>This week</span>
        </div>
      </div>
      <div className="employee-summary">
        <span>Tasks per employee · this week</span>
        <div className="employee-chips">
          {tasksPerEmployee.length ? tasksPerEmployee.map((person) => (
            <span className="employee-chip" key={person.username}>
              {person.username}<strong>{person.count}</strong>
            </span>
          )) : <em>No assigned tasks this week.</em>}
        </div>
      </div>
    </section>
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
  selectedDate,
  onEdit,
  onStatus,
  onDelete,
}: {
  tasks: Task[]
  compact?: boolean
  selectedDate?: string
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
              <span className="time">{formatTaskTime(task, selectedDate)}</span>
            </div>
            <h2>{task.title}</h2>
            {!compact && task.description && <p>{task.description}</p>}
            <div className="task-meta">
              <span>{STATUS_LABELS[task.status]}</span>
              <span>{task.assignees?.map((item) => item.username).join(', ') || 'Unassigned'}</span>
            </div>
          </button>
          <div className="quick-actions">
            <button onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}><Pencil size={15} /> Edit</button>
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

function ArchiveModal({
  tasks,
  onClose,
  onRestore,
  onDelete,
}: {
  tasks: Task[]
  onClose: () => void
  onRestore: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="task-modal archive-modal" role="dialog" aria-modal="true" aria-label="Task archive">
        <header>
          <div>
            <h2>Task Archive</h2>
            <p>Deleted tasks can be restored or removed permanently.</p>
          </div>
          <button type="button" onClick={onClose}><X /></button>
        </header>
        <div className="archive-list">
          {tasks.length ? tasks.map((task) => (
            <article className="archive-item" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.task_date} · {task.owner?.username || 'No owner'}</span>
              </div>
              <div className="archive-actions">
                <button className="restore-button" onClick={() => onRestore(task)}><ArchiveRestore size={16} /> Restore</button>
                <button className="delete-forever" onClick={() => onDelete(task)}><Trash2 size={16} /> Delete</button>
              </div>
            </article>
          )) : <div className="empty-state">Archive is empty.</div>}
        </div>
      </section>
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
            Entry Type
            <select value={form.task_kind} onChange={(e) => setForm({ ...form, task_kind: e.target.value as TaskKind })}>
              {Object.entries(TASK_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Start Date *
            <input type="date" value={form.task_date} onChange={(e) => setForm({ ...form, task_date: e.target.value, end_date: form.end_date < e.target.value ? e.target.value : form.end_date })} required />
          </label>
          <label>
            Start Time
            <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </label>
          <label>
            End Date *
            <input type="date" value={form.end_date} min={form.task_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
          </label>
          <label className="check-label next-day-check">
            <input type="checkbox" checked={form.end_date === toIsoDate(addDays(new Date(`${form.task_date}T12:00:00`), 1))} onChange={(e) => setForm({ ...form, end_date: e.target.checked ? toIsoDate(addDays(new Date(`${form.task_date}T12:00:00`), 1)) : form.task_date })} />
            <span>Ends next day</span>
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


function formatTaskTime(task: Task, day?: string) {
  const start = task.start_time?.slice(0, 5)
  const end = task.end_time?.slice(0, 5)
  if (!day || task.task_date === task.end_date) return start ? `${start}${end ? `–${end}` : ''}` : 'All day'
  if (day === task.task_date) return start ? `${start} → next day` : 'Starts'
  if (day === task.end_date) return end ? `continued → ${end}` : 'Ends'
  return 'Continues'
}


type BoardCell = { profile: Profile; date: Date; tasks: Task[]; leave: LeavePeriod | null }

function PlanningBoard({
  profiles,
  tasks,
  leaves,
  weekStart,
  onAssign,
  onEdit,
}: {
  profiles: Profile[]
  tasks: Task[]
  leaves: LeavePeriod[]
  weekStart: Date
  onAssign: (profile: Profile, date: Date) => void
  onEdit: (task: Task) => void
}) {
  const [selected, setSelected] = useState<BoardCell | null>(null)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const orderedProfiles = [...profiles].sort((a, b) => Number(a.username.split('-')[1]) - Number(b.username.split('-')[1]))

  function belongsTo(task: Task, profileId: string) {
    return task.owner_id === profileId || Boolean(task.assignees?.some((item) => item.id === profileId))
  }

  function cellFor(person: Profile, date: Date): BoardCell {
    const iso = toIsoDate(date)
    return {
      profile: person,
      date,
      tasks: tasks.filter((task) => belongsTo(task, person.id) && task.task_date <= iso && task.end_date >= iso && !['cancelled'].includes(task.status)),
      leave: leaves.find((leave) => leave.profile_id === person.id && leave.start_date <= iso && leave.end_date >= iso) || null,
    }
  }

  function cellClass(cell: BoardCell) {
    const normalCount = cell.tasks.filter((task) => (task.task_kind || 'task') === 'task' && task.status !== 'completed').length
    if (cell.leave) return 'board-cell is-leave'
    if (normalCount >= 5) return 'board-cell load-high'
    if (normalCount >= 3) return 'board-cell load-medium'
    if (normalCount >= 1) return 'board-cell load-low'
    return 'board-cell is-free'
  }

  function CellContent({ cell }: { cell: BoardCell }) {
    const duty = cell.tasks.some((task) => task.task_kind === 'duty')
    const standby = cell.tasks.some((task) => task.task_kind === 'standby')
    const normal = cell.tasks.filter((task) => (task.task_kind || 'task') === 'task' && task.status !== 'cancelled')
    return <>
      <span className="board-icons" aria-label={`${cell.profile.username} ${toIsoDate(cell.date)}`}>
        {cell.leave && <span title="Leave">🟥</span>}
        {!cell.leave && duty && <span title="Duty">🟦</span>}
        {!cell.leave && standby && <span title="Stand By">🟪</span>}
        {normal.slice(0, 4).map((task) => <span key={task.id} title={task.title}>📋</span>)}
        {normal.length > 4 && <small>+{normal.length - 4}</small>}
        {!cell.leave && !duty && !standby && normal.length === 0 && <span className="free-mark">—</span>}
      </span>
    </>
  }

  return <section className="planning-board" aria-label="Weekly planning board">
    <div className="board-legend" aria-label="Board legend">
      <strong>Legend</strong>
      <span>🟦 Duty</span>
      <span>🟪 Stand By</span>
      <span>🟥 Leave</span>
      <span>📋 Task</span>
      <span>— Free</span>
    </div>
    <p className="board-help">Tap a cell to see the day and assign a task. The employee column and day header stay visible while scrolling.</p>
    <div className="board-scroll">
      <div className="board-grid" style={{ gridTemplateColumns: `76px repeat(7, minmax(58px, 1fr)) 48px` }}>
        <div className="board-corner">IMP</div>
        {days.map((date) => <div className={`board-day ${isSameDay(date, new Date()) ? 'is-today' : ''}`} key={toIsoDate(date)}>
          <strong>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</strong>
          <small>{date.getDate()}</small>
        </div>)}
        <div className="board-total-head">Σ</div>

        {orderedProfiles.map((person) => {
          const cells = days.map((date) => cellFor(person, date))
          const weeklyNormalTasks = new Set(cells.flatMap((cell) => cell.tasks.filter((task) => (task.task_kind || 'task') === 'task').map((task) => task.id))).size
          return <div className="board-row-contents" key={person.id} style={{ display: 'contents' }}>
            <div className="board-person">{person.username}</div>
            {cells.map((cell) => <button
              type="button"
              className={cellClass(cell)}
              key={`${person.id}-${toIsoDate(cell.date)}`}
              onClick={() => setSelected(cell)}
              aria-label={`Open ${person.username}, ${formatLongDay(cell.date)}`}
            ><CellContent cell={cell} /></button>)}
            <div className="board-total">{weeklyNormalTasks}</div>
          </div>
        })}
      </div>
    </div>

    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
      <section className="task-modal board-detail-modal">
        <header>
          <div><h2>{selected.profile.username}</h2><p>{formatLongDay(selected.date)}</p></div>
          <button type="button" onClick={() => setSelected(null)}><X /></button>
        </header>
        {selected.leave && <div className="board-detail-status leave-status">🟥 {LEAVE_LABELS[selected.leave.leave_type]}</div>}
        {selected.tasks.length ? <div className="board-detail-list">
          {selected.tasks.map((task) => <button type="button" key={task.id} onClick={() => { setSelected(null); onEdit(task) }}>
            <span>{task.task_kind === 'duty' ? '🟦' : task.task_kind === 'standby' ? '🟪' : '📋'}</span>
            <div><strong>{task.title}</strong><small>{formatTaskTime(task, toIsoDate(selected.date))}</small></div>
            <ChevronRight size={18} />
          </button>)}
        </div> : <div className="empty-state compact-empty">No entries for this day.</div>}
        <footer className="single-action-footer">
          <button className="primary-button" type="button" onClick={() => { const { profile, date } = selected; setSelected(null); onAssign(profile, date) }}><Plus size={18} /> Assign task</button>
        </footer>
      </section>
    </div>}
  </section>
}

function LeavePage({ leaves, onAdd, onEdit, onDelete, canDelete }: { leaves: LeavePeriod[]; onAdd: () => void; onEdit: (leave: LeavePeriod) => void; onDelete: (leave: LeavePeriod) => void; canDelete: boolean }) {
  const today = toIsoDate(new Date())
  const activeAndUpcoming = [...leaves]
    .filter((leave) => leave.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const past = [...leaves]
    .filter((leave) => leave.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))

  return <section className="leave-page">
    <div className="leave-page-header">
      <div><h2>Leave</h2><p>Current, upcoming and previous absences.</p></div>
      <button type="button" className="primary-button leave-add-button" onClick={onAdd}><Plus size={17} /> Add Leave</button>
    </div>

    <div className="leave-section">
      <h3>Current & upcoming <span>{activeAndUpcoming.length}</span></h3>
      {activeAndUpcoming.length ? <LeaveList leaves={activeAndUpcoming} onEdit={onEdit} onDelete={onDelete} canDelete={canDelete} /> : <div className="empty-state">No current or upcoming leave.</div>}
    </div>

    <div className="leave-section">
      <h3>Previous <span>{past.length}</span></h3>
      {past.length ? <LeaveList leaves={past} onEdit={onEdit} onDelete={onDelete} canDelete={canDelete} /> : <div className="empty-state">No previous leave.</div>}
    </div>
  </section>
}

function LeaveList({ leaves, compact = false, onEdit, onDelete, canDelete = false }: { leaves: LeavePeriod[]; compact?: boolean; onEdit?: (leave: LeavePeriod) => void; onDelete?: (leave: LeavePeriod) => void; canDelete?: boolean }) {
  if (!leaves.length) return null
  return <div className="leave-list">{leaves.map((leave) => <article className="leave-card" key={leave.id}>
    <Palmtree size={18} />
    <div className="leave-card-content"><strong>{leave.profile?.username || 'Employee'} · {LEAVE_LABELS[leave.leave_type]}</strong>{!compact && <span>{leave.start_date} → {leave.end_date}{leave.note ? ` · ${leave.note}` : ''}</span>}</div>
    {!compact && onEdit && <div className="leave-card-actions">
      <button type="button" className="icon-action" onClick={() => onEdit(leave)} aria-label="Edit leave" title="Edit leave"><Pencil size={17} /></button>
      {canDelete && onDelete && <button type="button" className="icon-action danger" onClick={() => onDelete(leave)} aria-label="Delete leave" title="Delete leave"><Trash2 size={17} /></button>}
    </div>}
  </article>)}</div>
}

function LeaveModal({ form, setForm, profiles, editing, onClose, onSubmit, saving }: { form: LeaveFormData; setForm: (next: LeaveFormData) => void; profiles: Profile[]; editing: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void; saving: boolean }) {
  return <div className="modal-backdrop"><form className="task-modal" onSubmit={onSubmit}>
    <header><div><h2>{editing ? 'Edit Leave' : 'Add Leave'}</h2><p>One entry can cover several days.</p></div><button type="button" onClick={onClose}><X /></button></header>
    <div className="form-grid">
      <label>Employee *<select value={form.profile_id} onChange={(e) => setForm({...form, profile_id:e.target.value})} required><option value="">Select employee</option>{profiles.map((p)=><option key={p.id} value={p.id}>{p.username}</option>)}</select></label>
      <label>Leave Type<select value={form.leave_type} onChange={(e)=>setForm({...form, leave_type:e.target.value as LeaveFormData['leave_type']})}>{Object.entries(LEAVE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>From *<input type="date" value={form.start_date} onChange={(e)=>setForm({...form,start_date:e.target.value,end_date:form.end_date<e.target.value?e.target.value:form.end_date})} required /></label>
      <label>To *<input type="date" min={form.start_date} value={form.end_date} onChange={(e)=>setForm({...form,end_date:e.target.value})} required /></label>
    </div>
    <label>Note<textarea rows={3} maxLength={300} value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} /></label>
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Leave'}</button></footer>
  </form></div>
}

export default App
