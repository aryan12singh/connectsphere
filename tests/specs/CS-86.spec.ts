import { beforeAll,beforeEach,afterAll,describe,expect,it } from 'vitest'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),f=require('../helpers/venue-workflow.cjs')
let api:any
beforeAll(async()=>{api=await f.stack()})
beforeEach(()=>f.reset())
afterAll(async()=>{await api.close()})
describe('CS-86 — preserve and recheck inherited commitments',()=>{
  it('TC-CS86-01 flags both approved bookings after a buffer increase and clears them idempotently on resolution',async()=>{
    const {event}=await f.eventFixture(),v=await api.venue.http('/venues',{method:'POST',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:0})}),rooms=[]
    for(let i=0;i<2;i++){
      const r=await api.booking.http('/venue-bookings',{method:'POST',headers:{...f.coordinator,'idempotency-key':`recheck-${i}`},body:{eventId:event.id,venueId:v.body.id,title:`Room ${i}`,reason:'Conference',startAt:i?'2026-12-21T04:15:00.000Z':'2026-12-21T02:00:00.000Z',endAt:i?'2026-12-21T06:00:00.000Z':'2026-12-21T04:00:00.000Z',timeZone:'Asia/Singapore'}})
      expect(r.status).toBe(201)
      const approval=await api.booking.http(`/venue-bookings/${r.body.id}/decision`,{method:'PUT',headers:f.staff,body:{version:1,status:'CONFIRMED',reason:'Room verified'}})
      expect(approval.status).toBe(200);rooms.push(approval.body)
    }
    const edited=await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:45,version:1})})
    expect(edited.status).toBe(200)
    const path='/internal/venue-rechecks',headers={'x-internal-api-key':'change-me-dev-internal-key'},body={venueId:v.body.id,version:2,actor:{id:'staff',role:'VENUE_STAFF'},reason:'Longer reset required'}
    const checked=await api.booking.http(path,{method:'POST',headers,body})
    expect(checked.status).toBe(200)
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:['BUFFER_CONFLICT'],turnaroundMinutes:45,venueVersion:2})
    expect(f.bookings.state.outbox.filter((m:any)=>m.kind==='VenueConflictChanged')).toHaveLength(2)
    const count=f.bookings.state.activities.length
    expect((await api.booking.http(path,{method:'POST',headers,body})).status).toBe(200)
    expect(f.bookings.state.activities).toHaveLength(count)
    expect((await api.booking.http(path,{method:'POST',headers:f.coordinator,body})).status).toBe(403)
    expect((await api.venue.http(`/venues/${v.body.id}`,{method:'PUT',headers:f.staff,body:f.venueInput({setupMinutes:0,turnaroundMinutes:15,version:2})})).status).toBe(200)
    expect((await api.booking.http(path,{method:'POST',headers,body:{...body,version:3}})).status).toBe(200)
    for(const room of rooms)expect(f.bookings.getBooking(room.id)).toMatchObject({status:'CONFIRMED',flags:[],turnaroundMinutes:15,venueVersion:3})
    expect((await api.booking.http(`/venue-bookings/events/${event.id}/summary`,{headers:f.coordinator})).body.venueReady).toBe(true)
  })
})
