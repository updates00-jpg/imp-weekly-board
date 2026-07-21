export type TaskStatus = 'scheduled' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskKind = 'task' | 'duty' | 'standby'
export type UserRole = 'member' | 'admin'

export interface Profile {
  id: string
  username: string
  role: UserRole
  active: boolean
}

export interface Task {
  id: string
  title: string
  description: string | null
  task_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: TaskStatus
  priority: TaskPriority
  task_kind: TaskKind
  owner_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  owner?: Profile | null
  assignees?: Profile[]
}

export interface TaskFormData {
  title: string
  description: string
  task_date: string
  end_date: string
  start_time: string
  end_time: string
  ends_next_day: boolean
  status: TaskStatus
  priority: TaskPriority
  task_kind: TaskKind
  owner_id: string
  assignee_ids: string[]
}

export type LeaveType = 'annual' | 'sick' | 'training' | 'other'

export interface LeavePeriod {
  id: string
  profile_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  note: string | null
  created_by: string
  created_at: string
  profile?: Profile | null
}

export interface LeaveFormData {
  profile_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  note: string
}
