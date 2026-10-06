import type { Ref } from 'vue'
export function useUnsavedRequest(dirty:Ref<boolean>) {
 const leave=(event:BeforeUnloadEvent)=>{if(dirty.value){event.preventDefault();event.returnValue=''}}
 onMounted(()=>window.addEventListener('beforeunload',leave))
 onUnmounted(()=>window.removeEventListener('beforeunload',leave))
 onBeforeRouteLeave(()=>!dirty.value || window.confirm('You have unsaved changes. Leave without saving?'))
}
