import { createRequire } from 'node:module'
import { describe, expect, it,vi } from 'vitest'
import { mockNuxtImport,mountSuspended,registerEndpoint } from '@nuxt/test-utils/runtime'
import {bookingDraftState} from '../../frontend/app/components/venue/booking-state'
const calendarProof=vi.hoisted(()=>({availability:null as any,events:[] as any[]}))
mockNuxtImport('useFetch',()=>async(path:string)=>{const {ref}=await import('vue');return {data:ref(path.includes('availability')?(calendarProof.availability??{items:[{id:'buffer-ui',venueId:'venue',title:'Conference',status:'CONFIRMED',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:45:00.000Z',setupMinutes:30,turnaroundMinutes:45}]}):{events:calendarProof.events}),error:ref(null),refresh:vi.fn()}})

const require = createRequire(import.meta.url)
const availability = require('../../services/booking-service/src/availability.js')

describe('CS-85 — occupied-window calculation (domain unit tests)', () => {
  it('TC-CS85-15 same-fixture search, calendar, preflight and write guard agree without creating a conflicting request',async()=>{
    const f=require('../helpers/venue-workflow.cjs'),api=await f.stack();f.reset()
    let wrapper:any
    try{
      vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-12-21T00:00:00Z'))
      const {event}=await f.eventFixture(),venue=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({turnaroundMinutes:45})})
      const body={eventId:event.id,venueId:venue.body.id,title:'Conference',reason:'Same-fixture proof',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}
      const booked=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'same-fixture'},body});expect(booked.status).toBe(201)
      const available=await api.booking.http('/venue-bookings/availability?venueId='+venue.body.id,{headers:f.coordinator});expect(available.status).toBe(200)
      calendarProof.availability=available.body;calendarProof.events=[{id:event.id,title:'Conference',status:'ARRANGEMENT_PENDING'}]
      const component=(await import('../../frontend/app/components/venue/VenueCalendar.vue')).default
      wrapper=await mountSuspended(component,{props:{venueId:venue.body.id,venueName:'Same fixture',timeZone:'Asia/Singapore',setupMinutes:30,turnaroundMinutes:45,canCreate:true,canDecide:false,actorRole:'EVENT_COORDINATOR',actorId:'coordinator'}})
      const slot=wrapper.findAll('button').find((b:any)=>b.text().includes('Conference'))
      expect(slot.attributes('title')).toContain('Occupied: 2026-12-21 09:30');expect(slot.attributes('title')).toContain('2026-12-21 12:45')
      expect(wrapper.find('[data-buffer="setup"]').exists()).toBe(true);expect(wrapper.find('[data-buffer="turnaround"]').exists()).toBe(true)
      await wrapper.findAll('button').find((b:any)=>b.text()==='New booking').trigger('click')
      await wrapper.findAll('input[type="datetime-local"]')[0].setValue('2026-12-21T12:15')
      await wrapper.findAll('input[type="datetime-local"]')[1].setValue('2026-12-21T14:00')
      await wrapper.get('select[required]').setValue(event.id)
      await wrapper.get('input[placeholder="Add event title..."]').setValue('Clashing room')
      await wrapper.get('textarea').setValue('This setup still intersects the occupied interval')
      expect(wrapper.get('[role="alert"]').text()).toBe('This booking overlaps an unavailable interval.')
      expect(wrapper.text()).toContain('Overlaps: '+booked.body.id);expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
      const posts=vi.fn(()=>({}));registerEndpoint('/api/bookings',{method:'POST',handler:posts})
      await wrapper.get('form').trigger('submit');expect(posts).not.toHaveBeenCalled()
      const search=await api.booking.http('/venue-bookings/events/'+event.id+'/venue-search?startAt=2026-12-21T04%3A15%3A00.000Z&endAt=2026-12-21T06%3A00%3A00.000Z',{headers:f.coordinator})
      expect(search.status).toBe(200);expect(search.body.items.map((r:any)=>r.id)).not.toContain(venue.body.id)
      const before=JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})
      const denied=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':'same-fixture-denial'},body:{...body,startAt:'2026-12-21T04:15:00.000Z',endAt:'2026-12-21T06:00:00.000Z'}})
      expect(denied.status).toBe(409);expect(JSON.stringify(denied.body)).toContain(booked.body.id)
      expect(JSON.stringify({bookings:f.bookings.listBookings(),activities:f.bookings.state.activities,outbox:f.bookings.state.outbox})).toBe(before)
    }finally{wrapper?.unmount();calendarProof.availability=null;calendarProof.events=[];vi.useRealTimers();await api.close()}
  })
  it('TC-CS85-14 calendar preflight uses the server occupied windows and the candidate venue buffers',()=>{
    const candidate={venueId:'venue',title:'Conference',reason:'Room request',timeZone:'Asia/Singapore',startAt:'2026-12-21T04:15:00.000Z',endAt:'2026-12-21T06:00:00.000Z',status:'TENTATIVELY_HELD'}
    const existing={id:'room',venueId:'venue',title:'Existing',status:'CONFIRMED',startAt:'2026-12-21T02:00:00.000Z',endAt:'2026-12-21T04:00:00.000Z',occupiedStart:'2026-12-21T01:30:00.000Z',occupiedEnd:'2026-12-21T04:30:00.000Z'}
    expect(bookingDraftState(candidate,[existing],null,false,{setupMinutes:30,turnaroundMinutes:30,allowTouching:true} as any).canSubmit).toBe(false)
  })
  it('TC-CS85-03 shades setup and turnaround in the actual calendar around the advertised booking',async()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-12-21T00:00:00Z'))
    try {
      const component=(await import('../../frontend/app/components/venue/VenueCalendar.vue')).default
      const wrapper=await mountSuspended(component,{props:{venueId:'venue',venueName:'Bay Hall',timeZone:'Asia/Singapore',canCreate:false,canDecide:false}})
      expect(wrapper.find('[data-buffer="setup"]').exists()).toBe(true)
      expect(wrapper.find('[data-buffer="turnaround"]').exists()).toBe(true)
      expect(wrapper.findAll('button').find(b=>b.text().includes('Conference'))?.attributes('title')).toContain('Occupied: 2026-12-21 09:30')
      wrapper.unmount()
    } finally {vi.useRealTimers()}
  })
  it('TC-CS85-01 expands the advertised interval by the venue setup and turnaround', () => {
    expect(availability.occupiedWindow?.({
      startAt: '2026-12-22T10:00:00+08:00',
      endAt: '2026-12-22T12:00:00+08:00',
    }, { setupMinutes: 30, turnaroundMinutes: 45 })).toEqual({
      startAt: '2026-12-22T01:30:00.000Z',
      endAt: '2026-12-22T04:45:00.000Z',
    })
  })

  it('TC-CS85-01 preserves the advertised instants when both buffers are zero', () => {
    expect(availability.occupiedWindow({ startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' },
      { setupMinutes: 0, turnaroundMinutes: 0 })).toEqual({ startAt: '2026-12-22T10:00:00.000Z', endAt: '2026-12-22T12:00:00.000Z' })
  })

  it('TC-CS85-01 expands across midnight and year boundaries without changing the booking', () => {
    const booking = Object.freeze({ startAt: '2027-01-01T00:15:00Z', endAt: '2027-01-01T23:45:00Z' })
    const buffers = Object.freeze({ setupMinutes: 30, turnaroundMinutes: 30 })
    expect(availability.occupiedWindow(booking, buffers)).toEqual({ startAt: '2026-12-31T23:45:00.000Z', endAt: '2027-01-02T00:15:00.000Z' })
    expect(booking).toEqual({ startAt: '2027-01-01T00:15:00Z', endAt: '2027-01-01T23:45:00Z' })
  })

  it('TC-CS85-01 uses instants rather than comparing repeated local clock values', () => {
    expect(availability.occupiedWindow({ startAt: '2026-11-01T01:30:00-04:00', endAt: '2026-11-01T01:30:00-05:00' },
      { setupMinutes: 30, turnaroundMinutes: 15 })).toEqual({ startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T06:45:00.000Z' })
  })

  it('TC-CS85-01 applies each selected venue\'s own buffers', () => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: 30 })).toEqual({ startAt: '2026-12-22T10:00:00.000Z', endAt: '2026-12-22T12:30:00.000Z' })
    expect(availability.occupiedWindow(booking, { setupMinutes: 60, turnaroundMinutes: 0 })).toEqual({ startAt: '2026-12-22T09:00:00.000Z', endAt: '2026-12-22T12:00:00.000Z' })
  })

  it.each([-1, 0.5, '30', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('TC-CS85-11 rejects invalid buffer minutes (%s) without coercion', (value) => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindow(booking, { setupMinutes: value, turnaroundMinutes: 0 })).toThrow(/setupMinutes/)
    expect(() => availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: value })).toThrow(/turnaroundMinutes/)
  })

  it.each(['not-a-date', '2026-12-22', '2026-12-22T10:00:00', '2026-02-30T10:00:00Z', '2026-13-01T10:00:00Z', '2026-12-22T24:00:00Z', '2026-12-22T10:00:00.0001Z', null, undefined])('TC-CS85-12 rejects invalid or ambiguous instants (%s)', (value) => {
    const buffers = { setupMinutes: 0, turnaroundMinutes: 0 }
    expect(() => availability.occupiedWindow({ startAt: value, endAt: '2026-12-23T12:00:00Z' }, buffers)).toThrow(/startAt/)
    expect(() => availability.occupiedWindow({ startAt: '2026-01-01T10:00:00Z', endAt: value }, buffers)).toThrow(/endAt/)
  })

  it('TC-CS85-12 rejects equal or reversed booking instants', () => {
    const buffers = { setupMinutes: 30, turnaroundMinutes: 45 }
    for (const endAt of ['2026-12-22T10:00:00Z', '2026-12-22T09:00:00Z']) {
      expect(() => availability.occupiedWindow({ startAt: '2026-12-22T10:00:00Z', endAt }, buffers)).toThrow(/endAt/)
    }
  })

  it('TC-CS85-13 fails closed when expansion cannot be represented as date-time instants', () => {
    const booking = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindow(booking, { setupMinutes: Number.MAX_SAFE_INTEGER, turnaroundMinutes: 0 })).toThrow(/occupied window/)
    expect(() => availability.occupiedWindow(booking, { setupMinutes: 0, turnaroundMinutes: Number.MAX_SAFE_INTEGER })).toThrow(/occupied window/)
  })

  it.each([
    ['2026-12-22T12:44:00Z', true],
    ['2026-12-22T12:44:59Z', true],
    ['2026-12-22T12:45:00Z', false],
    ['2026-12-22T12:46:00Z', false],
  ])('TC-CS85-07 compares occupied windows at %s with touching explicitly permitted', (startAt, expected) => {
    const first = { startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' }
    const second = { startAt, endAt: '2026-12-22T14:00:00Z' }
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: true })).toBe(expected)
    expect(availability.occupiedWindowsOverlap?.(second, first, { allowTouching: true })).toBe(expected)
  })

  it('TC-CS85-07 applies a forbidden-touching policy without changing either window', () => {
    const first = Object.freeze({ startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' })
    const second = Object.freeze({ startAt: '2026-12-22T20:45:00+08:00', endAt: '2026-12-22T22:00:00+08:00' })
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: false })).toBe(true)
    expect(availability.occupiedWindowsOverlap?.(first, second, { allowTouching: true })).toBe(false)
    expect(first.endAt).toBe('2026-12-22T12:45:00Z')
    expect(second.startAt).toBe('2026-12-22T20:45:00+08:00')
  })

  it('TC-CS85-07 detects containment and identical windows but permits a real gap', () => {
    const outer = { startAt: '2026-12-22T09:30:00Z', endAt: '2026-12-22T12:45:00Z' }
    const inner = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T11:00:00Z' }
    const later = { startAt: '2026-12-22T13:00:00Z', endAt: '2026-12-22T14:00:00Z' }
    for (const allowTouching of [true, false]) {
      expect(availability.occupiedWindowsOverlap?.(outer, inner, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(inner, outer, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(outer, outer, { allowTouching })).toBe(true)
      expect(availability.occupiedWindowsOverlap?.(outer, later, { allowTouching })).toBe(false)
    }
  })

  it.each([undefined, {}, { allowTouching: 'true' }, { allowTouching: 1 }])('TC-CS85-07 refuses to invent a touching policy (%s)', (options) => {
    const window = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindowsOverlap(window, window, options)).toThrow(/allowTouching/)
  })

  it('TC-CS85-12 rejects invalid comparison windows before reporting availability', () => {
    const valid = { startAt: '2026-12-22T10:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    const reversed = { startAt: '2026-12-22T13:00:00Z', endAt: '2026-12-22T12:00:00Z' }
    expect(() => availability.occupiedWindowsOverlap(reversed, valid, { allowTouching: true })).toThrow(/endAt/)
    expect(() => availability.occupiedWindowsOverlap(valid, reversed, { allowTouching: true })).toThrow(/endAt/)
  })
})
