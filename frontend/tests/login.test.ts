import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import LoginPage from '../app/pages/login.vue'

describe('login page', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  it('renders the organiser sign-in form with accessible controls', async () => {
    const wrapper = await mountSuspended(LoginPage)

    expect(wrapper.get('h1').text()).toBe('Sign in to your account')
    expect(wrapper.get('input[type="email"]').attributes('placeholder')).toBe('m@example.com')
    expect(wrapper.get('input[type="password"]').attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get('button[type="submit"]').text()).toBe('Sign in')
    expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('Use dark mode')
  })

  it('toggles and persists dark mode', async () => {
    const wrapper = await mountSuspended(LoginPage)
    const themeSwitch = wrapper.get('[role="switch"]')

    await themeSwitch.trigger('click')

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('connectsphere-theme')).toBe('dark')
    expect(wrapper.get('[role="switch"]').attributes('aria-label')).toBe('Use light mode')
  })
})
