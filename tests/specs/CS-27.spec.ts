import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RequestFormPage from '../../frontend/app/components/RequestFormPage.vue'
import { emptyRequestForm } from '../../frontend/app/components/request-form-state'
describe('CS-27 — TC-CS27-01 returned amendment interface',()=>{
 it('shows escaped return comments beside the form and separate Save/Resubmit controls',async()=>{
  const w=await mountSuspended(RequestFormPage,{props:{title:'Returned request',statusLabel:'Returned for Amendment',mode:'edit',modelValue:{...emptyRequestForm(),eventName:'Draft'},returnComments:'<script>secret</script>'} as any})
  expect(w.text()).toContain('<script>secret</script>');expect(w.find('script').exists()).toBe(false)
  expect(w.text()).toContain('Resubmit request');expect(w.text()).toContain('Save changes')
 })
 it('shows every field error and ties messages to controls',async()=>{
  const w=await mountSuspended(RequestFormPage,{props:{title:'Returned',statusLabel:'Returned',mode:'edit',modelValue:emptyRequestForm(),fieldErrors:{eventName:['Name required'],purpose:['Purpose required']}} as any})
  expect(w.text()).toContain('Name required');expect(w.text()).toContain('Purpose required');expect(w.get('#event-name').attributes('aria-invalid')).toBe('true')
 })
})
import { eventHarness,valid } from '../helpers/event-api-harness'
describe('CS-27 — TC-CS27-02 return, amend and resubmit through BFF',()=>{
 it('keeps ID/coordinator, return baseline across saves, comments and one concurrent resubmission',async()=>{
  const api=await eventHarness();try{
   const r=await api.call('POST','/api/events',valid);const p='/api/events/'+r.body.id
   const returned=await api.call('POST',p+'/decision',{decision:'amendments',notes:'Increase attendance',version:r.body.version},'coord');expect(returned.status).toBe(200)
   expect((await api.call('PUT',p,{version:returned.body.version,action:'resubmit'})).status).toBe(409)
   const saved=await api.call('PUT',p,{version:returned.body.version,expectedAttendance:120});expect(saved.status).toBe(200)
   const key=crypto.randomUUID(),body={version:saved.body.version,action:'resubmit'}
   const rs=await Promise.all([api.call('PUT',p,body,'owner',key),api.call('PUT',p,body,'owner',key)])
   expect(rs.every(x=>x.status===200&&x.body.id===r.body.id&&x.body.coordinatorId===r.body.coordinatorId&&x.body.status==='SUBMITTED')).toBe(true)
   const h=await api.call('GET',p+'/activity',undefined,'coord');expect(h.body.items.filter((a:any)=>a.action==='RESUBMITTED')).toHaveLength(1);expect(h.body.items.find((a:any)=>a.action==='RESUBMITTED').details.changes.expectedAttendance).toEqual({old:100,new:120});expect(h.body.items.find((a:any)=>a.action==='RETURN').details.note).toBe('Increase attendance')
  }finally{await api.close()}
 })
})
describe('CS-27 — TC-CS27-03 invalid and unauthorised revisions',()=>{
 it('denies wrong owner and invalid resubmission, and locks rejected requests',async()=>{
  const api=await eventHarness();try{const r=await api.call('POST','/api/events',valid);const p='/api/events/'+r.body.id;const ret=await api.call('POST',p+'/decision',{decision:'amendments',notes:'Please amend',version:r.body.version},'coord');expect((await api.call('PUT',p,{version:ret.body.version,expectedAttendance:120,action:'resubmit'},'other')).status).toBe(403);expect((await api.call('PUT',p,{version:ret.body.version,expectedAttendance:0,action:'resubmit'})).status).toBe(422)
   const second=await api.call('POST','/api/events',valid);const q='/api/events/'+second.body.id;const reject=await api.call('POST',q+'/decision',{decision:'reject',notes:'Not feasible',version:second.body.version},'coord');expect((await api.call('PUT',q,{version:reject.body.version,eventName:'Override'})).status).toBe(409)
  }finally{await api.close()}
 })
})
