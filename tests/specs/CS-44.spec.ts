import { describe,it,expect,vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import History from '../../frontend/app/components/events/RequestActivityHistory.vue'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Detail from '../../frontend/app/pages/requests/[id].vue'
const fixture=vi.hoisted(()=>({fetch:vi.fn()}))
mockNuxtImport('useRequestFetch',()=>()=>fixture.fetch)
mockNuxtImport('useRoute',()=>()=>({params:{id:'keyboard-draft'}}))
mockNuxtImport('useUserSession',()=>()=>({user:ref({id:'keyboard-owner'}),loggedIn:ref(true)}))
mockNuxtImport('useFetch',()=>(url:string)=>({data:ref(url.endsWith('/coordinator')?null:{id:'keyboard-draft',organiserId:'keyboard-owner',status:'DRAFT',version:1,purpose:'Saved purpose'}),error:ref(null)}))
describe('CS-44 — TC-CS44-01 authorised history interface',()=>{
 it('renders old/new values, System/actor/time and escaped comments in expandable entries',async()=>{
  fixture.fetch.mockResolvedValue({items:[{id:'a',action:'RESUBMITTED',actorType:'USER',actorId:'owner',createdAt:'2026-10-06T12:00:00Z',fromStatus:'RETURNED_FOR_AMENDMENT',toStatus:'SUBMITTED',details:{note:'<img src=x onerror=alert(1)>',changes:{expectedAttendance:{old:50,new:75}}}}],nextCursor:null})
  try{const w=await mountSuspended(History,{props:{requestId:'r'}});await flushPromises();expect(w.text()).toContain('50 → 75');expect(w.text()).toContain('owner');expect(w.get('time').attributes('datetime')).toBe('2026-10-06T12:00:00Z');expect(w.find('img').exists()).toBe(false);expect(w.find('details').exists()).toBe(true)}finally{vi.unstubAllGlobals()}
 })
 it('handles empty, retryable error and older pages',async()=>{
  const fetch=fixture.fetch.mockReset().mockRejectedValue(new Error('Offline'))
  try{const w=await mountSuspended(History,{props:{requestId:'r'}});await flushPromises();expect(w.get('[role="alert"]').text()).toContain('Offline');fetch.mockResolvedValue({items:[],nextCursor:'20'});await w.findAll('button').find(b=>b.text()==='Retry history')!.trigger('click');await flushPromises();expect(w.text()).toContain('No activity recorded');fetch.mockResolvedValue({items:[{id:'old',action:'COORDINATOR_ASSIGNED',actorType:'SYSTEM',actorId:null,createdAt:'2026-10-06T12:00:00Z',fromStatus:'SUBMITTED',toStatus:'SUBMITTED'}],nextCursor:null});await w.findAll('button').find(b=>b.text()==='Load older activity')!.trigger('click');await flushPromises();expect(w.text()).toContain('System');expect(fetch).toHaveBeenLastCalledWith('/api/events/r/activity',{query:{cursor:'20'}})}finally{vi.unstubAllGlobals()}
 })
})
describe('CS-44 — TC-CS44-03 keyboard tabs retain unsaved input',()=>{
 it('supports tab keyboard navigation without dropping typed input',async()=>{
  fixture.fetch.mockResolvedValue({items:[],nextCursor:null})
  const wrapper=await mountSuspended(Detail,{attachTo:document.body})
  try{
   const details=wrapper.get<HTMLButtonElement>('[role="tab"]:first-child'),history=wrapper.get<HTMLButtonElement>('[role="tab"]:last-child')
   await wrapper.get('#purpose').setValue('Unsaved purpose')
   expect(details.element.disabled).toBe(false)
   expect(wrapper.get(`#${details.attributes('aria-controls')}`).attributes('aria-labelledby')).toBe(details.attributes('id'))
   details.element.focus()
   await details.trigger('keydown',{key:'ArrowRight'})
   await flushPromises()
   expect(document.activeElement).toBe(history.element)
   expect(history.attributes('aria-selected')).toBe('true')
   expect(details.attributes('aria-selected')).toBe('false')
   await history.trigger('keydown',{key:'Home'})
   await flushPromises()
   expect(document.activeElement).toBe(details.element)
   expect(details.attributes('aria-selected')).toBe('true')
   expect(wrapper.get<HTMLTextAreaElement>('#purpose').element.value).toBe('Unsaved purpose')
   await details.trigger('keydown',{key:'End'})
   await flushPromises()
   expect(document.activeElement).toBe(history.element)
   expect(history.attributes('aria-selected')).toBe('true')
   await history.trigger('keydown',{key:'ArrowLeft'})
   await flushPromises()
   expect(document.activeElement).toBe(details.element)
   expect(details.attributes('aria-selected')).toBe('true')
   expect(wrapper.get<HTMLTextAreaElement>('#purpose').element.value).toBe('Unsaved purpose')
  }finally{wrapper.unmount()}
 })
})
