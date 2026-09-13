import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginWithBff } from '@/lib/auth'
import LoginPage from '../app/pages/login.vue'

vi.mock('@/lib/auth', () => ({
  loginWithBff: vi.fn(),
}))

const loginMock = vi.mocked(loginWithBff)

describe('login page', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    vi.resetAllMocks()
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

  it('signs in through the BFF and announces the mock user', async () => {
    loginMock.mockResolvedValue({
      user: { id: 'mock-user-1', email: 'm@example.com', name: 'Event Organiser', role: 'organiser' },
      token: 'mock-token-123',
    })
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.get('input[type="email"]').setValue('m@example.com')
    await wrapper.get('input[type="password"]').setValue('password123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(loginMock).toHaveBeenCalledWith({
      email: 'm@example.com',
      password: 'password123',
      rememberMe: false,
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Signed in as m@example.com')
  })

  it('announces BFF sign-in errors accessibly', async () => {
    loginMock.mockRejectedValue(new Error('Invalid credentials'))
    const wrapper = await mountSuspended(LoginPage)

    await wrapper.get('input[type="email"]').setValue('m@example.com')
    await wrapper.get('input[type="password"]').setValue('wrong')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Invalid credentials')
  })
})
