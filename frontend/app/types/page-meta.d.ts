// Lets a page declare the permission it needs:
//
//   definePageMeta({ permission: 'users.view' })
//
// app/middleware/auth.global.ts checks it on every navigation.
declare module '#app' {
  interface PageMeta {
    permission?: string
  }
}

export {}
