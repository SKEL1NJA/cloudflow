import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { headerOf, json, mockFetch, testUser } from '@/test/fetch';
import { LoginPage } from './login';

function renderLogin() {
  const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
    initialEntries: ['/login'],
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  sessionStore.signOut();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('LoginPage', () => {
  it('shows validation messages and does not call the API for an empty form', async () => {
    const fetchMock = mockFetch(() => json(200, {}));
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in with normalized credentials and keeps the refresh cookie flow enabled', async () => {
    const fetchMock = mockFetch(() => json(200, { user: testUser, accessToken: 'token-1' }));
    renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), '  Uday@Example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(sessionStore.getState().status).toBe('authenticated'));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://api.test/auth/login');
    expect(init?.credentials).toBe('include');
    expect(headerOf(init, 'authorization')).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'uday@example.com',
      password: 'correct-horse-battery',
    });
  });

  it('shows the server message, clears the password and focuses it after a failed sign-in', async () => {
    mockFetch(() =>
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), 'uday@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(sessionStore.getState().status).toBe('anonymous');
  });

  it('explains when the session has expired', () => {
    sessionStore.setSession(testUser, 'token-1');
    sessionStore.expire();
    renderLogin();

    expect(screen.getByRole('status')).toHaveTextContent('Your session expired');
  });
});
