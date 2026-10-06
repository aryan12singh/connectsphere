import { setResponseStatus } from 'h3'
import { requestCall, writeOptions, browserRecord } from '../utils/eventBff'

export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED_FOR_AMENDMENT' | 'APPROVED' | 'REJECTED'

export interface EventRequestForm {
  eventName: unknown
  purpose: unknown
  description: unknown
  proposedDate: unknown
  expectedAttendance: unknown
  startTime: unknown
  endTime: unknown
  timeZone: unknown
  minimumCapacity: unknown
  preferredLayout: unknown
  venueType: unknown
  venueRequirements: unknown
  accessibilityNeeds: unknown
  accessibilityDetails: unknown
  equipmentNeeds: unknown
  technicalDetails: unknown
}

export interface EventRequestRecord {
  id: string
  organiserId: string
  status: RequestStatus
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  coordinatorId: string | null
  reviewedById?: string | null
  reviewedAt?: string | null
  decisionNotes?: string
  eventName: string
  purpose: string
  description: string
  proposedDate: string
  expectedAttendance: number
  startTime: string
  endTime: string
  timeZone: string
  minimumCapacity: number | null
  preferredLayout: string
  venueType: string
  venueRequirements: string
  accessibilityNeeds: string[]
  accessibilityDetails: string
  equipmentNeeds: string[]
  technicalDetails: string
}


export default defineEventHandler(async (event) => {
  const { body, headers } = await writeOptions(event)
  const record = await requestCall(event, '/event-requests', {method:'POST', body:{...body,saveAs:body.saveAs ?? 'submit'},headers})
  setResponseStatus(event, 201)
  return browserRecord(record)
})
