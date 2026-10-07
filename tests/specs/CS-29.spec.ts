import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RequestFormPage from '../../frontend/app/components/RequestFormPage.vue'
import { emptyRequestForm } from '../../frontend/app/components/request-form-state'
describe('CS-29 — TC-CS29-01 incomplete private draft form',()=>{
 it('disables empty Save, enables a single purpose without requiring a title',async()=>{
  const f=emptyRequestForm();const w=await mountSuspended(RequestFormPage,{props:{title:'Draft',statusLabel:'Draft',mode:'create',modelValue:f}})
  const save=()=>w.findAll('button').find(b=>b.text()==='Save draft')!
  expect(save().attributes('disabled')).toBeDefined()
  await w.setProps({modelValue:{...f,purpose:'Collecting details'}})
  expect(save().attributes('disabled')).toBeUndefined()
 })
 it('permits incomplete form actions without native browser mandatory blockers',async()=>{
  const w=await mountSuspended(RequestFormPage,{props:{title:'Draft',statusLabel:'Draft',mode:'draft',modelValue:emptyRequestForm()}})
  expect(w.get('form').attributes()).toHaveProperty('novalidate')
 })
})
import { eventHarness,valid } from '../helpers/event-api-harness'
describe('CS-29 — TC-CS29-02 durable BFF drafts',()=>{
 it('saves an incomplete private draft, updates the same ID and submits that record',async()=>{
  const api=await eventHarness();try{
   const key=crypto.randomUUID();const draft=await api.call('POST','/api/events',{purpose:'Only one field',saveAs:'draft'},'owner',key)
   expect(draft.status).toBe(201);expect((await api.call('POST','/api/events',{purpose:'Only one field',saveAs:'draft'},'owner',key)).body.id).toBe(draft.body.id)
   const path='/api/events/'+draft.body.id;expect((await api.call('GET',path)).body.purpose).toBe('Only one field');expect((await api.call('GET',path,undefined,'coord')).status).toBe(403)
   expect(await api.db.outbox.count({where:{aggregateId:draft.body.id}})).toBe(0);expect(await api.db.coordinatorAssignment.count({where:{eventRequestId:draft.body.id}})).toBe(0)
   const submit=await api.call('PUT',path,{...valid,version:draft.body.version,submit:true});expect(submit.status).toBe(200);expect(submit.body).toMatchObject({id:draft.body.id,status:'SUBMITTED'})
  }finally{await api.close()}
 })
})
describe('CS-29 — TC-CS29-03 failed saves and stale versions',()=>{
 it('preserves the last committed version after validation failure and rejects stale saves',async()=>{
  const api=await eventHarness();try{const r=await api.call('POST','/api/events',{eventName:'Original',saveAs:'draft'});const p='/api/events/'+r.body.id;expect((await api.call('PUT',p,{version:r.body.version,expectedAttendance:'bad'})).status).toBe(422);expect((await api.call('GET',p)).body.eventName).toBe('Original');const s=await api.call('PUT',p,{version:r.body.version,eventName:'New'});expect(s.status).toBe(200);expect((await api.call('PUT',p,{version:r.body.version,eventName:'Stale'})).status).toBe(409);expect((await api.call('GET',p)).body.eventName).toBe('New')}finally{await api.close()}
 })
})
