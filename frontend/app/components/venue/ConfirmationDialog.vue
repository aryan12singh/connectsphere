<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref} from 'vue'
const props=defineProps<{label:string;busy?:boolean;returnFocus?:HTMLElement|null}>()
const emit=defineEmits<{dismiss:[]}>()
const dialog=ref<HTMLDialogElement|null>(null)
let previous:HTMLElement|null=null
function trapTab(event:KeyboardEvent){
 const controls=[...(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[])].filter(element=>element.getClientRects().length>0)
 const first=controls[0],last=controls.at(-1)
 if(!first){event.preventDefault();dialog.value?.focus();return}
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
onMounted(()=>{
 previous=props.returnFocus||(document.activeElement instanceof HTMLElement?document.activeElement:null)
 dialog.value?.showModal()
 dialog.value?.querySelector<HTMLElement>('[autofocus],button,input,textarea')?.focus()
})
onBeforeUnmount(()=>{
 dialog.value?.close()
 if(previous?.isConnected)previous.focus()
})
</script>

<template>
  <dialog ref="dialog" role="dialog" aria-modal="true" :aria-label="label" :aria-busy="Boolean(busy)" class="m-auto max-h-[85vh] w-[min(36rem,92vw)] overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40" @keydown.tab="trapTab" @cancel.prevent="!busy && emit('dismiss')">
    <div class="grid gap-3"><slot /></div>
  </dialog>
</template>
