import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../../../test-utils/render';
import { ApiError } from '../../../api/client';
import { ResetPasswordScreen } from '../ResetPasswordScreen';

const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// This project's RNTL renders on a concurrent root, so firing events in a
// synchronous run overlaps act() scopes and wedges the renderer for the rest
// of the file. Await each interaction before the next.
async function type(label: string, value: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
}

async function press(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });
}

/** Renders with a token and waits for the link check to settle on the form. */
async function renderForm(onSubmit?: jest.Mock) {
  const view = await renderWithProviders(
    <ResetPasswordScreen token="a-token" onSubmit={onSubmit} />,
  );
  expect(await screen.findByText('Set a new password')).toBeOnTheScreen();
  return view;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('ResetPasswordScreen', () => {
  it('shows the form once a token is present', async () => {
    await renderForm();

    expect(screen.getByLabelText('New password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirm new password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Save new password')).toBeOnTheScreen();
  });

  it('never accuses a good link, since the form is what the prerendered page paints first', async () => {
    // The static web export prerenders this route with no query params; an
    // initial state derived from `token` would bake the missing-token error
    // into that HTML and show it to every visitor with a working link.
    await renderForm();

    expect(
      screen.queryByText(
        'This link is missing its reset token — or the password was already reset and this page was just reloaded.',
      ),
    ).not.toBeOnTheScreen();
  });

  it('settles into an error with a way to get a fresh link when the token is missing', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<ResetPasswordScreen onSubmit={onSubmit} />);

    expect(
      await screen.findByText(
        'This link is missing its reset token — or the password was already reset and this page was just reloaded.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('New password')).not.toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();

    await press('Request a new link');
    expect(mockRouterReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('requires a new password and does not submit without one', async () => {
    const onSubmit = jest.fn();
    await renderForm(onSubmit);

    await press('Save new password');

    expect(await screen.findByText('Enter a new password.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces the backend minimum password length', async () => {
    const onSubmit = jest.fn();
    await renderForm(onSubmit);

    await type('New password', 'short');
    await type('Confirm new password', 'short');
    await press('Save new password');

    expect(await screen.findByText('Use at least 8 characters.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('enforces the backend maximum password length, rather than letting it read as a dead link', async () => {
    // Over the bound the API answers 422 — the same status it uses for a
    // spent token — so this has to be caught here or the user is told their
    // link expired.
    const tooLong = 'p'.repeat(129);
    const onSubmit = jest.fn();
    await renderForm(onSubmit);

    await type('New password', tooLong);
    await type('Confirm new password', tooLong);
    await press('Save new password');

    expect(await screen.findByText('Use at most 128 characters.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText('We couldn’t reset that password')).not.toBeOnTheScreen();
  });

  it('requires the confirmation to match', async () => {
    const onSubmit = jest.fn();
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrasE');
    await press('Save new password');

    expect(await screen.findByText("Passwords don't match.")).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a field error once the user corrects it', async () => {
    await renderForm(jest.fn());

    await press('Save new password');
    expect(await screen.findByText('Enter a new password.')).toBeOnTheScreen();

    await type('New password', 'new-passphrase');

    await waitFor(() =>
      expect(screen.queryByText('Enter a new password.')).not.toBeOnTheScreen(),
    );
  });

  it('clears a mismatch error from whichever field the user goes back to', async () => {
    await renderForm(jest.fn());

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrasE');
    await press('Save new password');
    expect(await screen.findByText("Passwords don't match.")).toBeOnTheScreen();

    // Fixing the confirmation clears it…
    await type('Confirm new password', 'new-passphrase');
    await waitFor(() =>
      expect(screen.queryByText("Passwords don't match.")).not.toBeOnTheScreen(),
    );

    // …and so does changing the password the confirmation is measured against.
    await type('Confirm new password', 'something-else');
    await press('Save new password');
    expect(await screen.findByText("Passwords don't match.")).toBeOnTheScreen();

    await type('New password', 'something-else');
    await waitFor(() =>
      expect(screen.queryByText("Passwords don't match.")).not.toBeOnTheScreen(),
    );
  });

  it('submits the token and the new password, then points the user at login', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a-token', 'new-passphrase'));
    expect(await screen.findByText('Password updated')).toBeOnTheScreen();

    await press('Log in');
    // Not the dashboard: the reset revokes every refresh token and returns no
    // token pair, so there is no session to continue into.
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/dashboard');
  });

  it('submits when the confirmation field fires its "go" key', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await act(async () => {
      fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a-token', 'new-passphrase'));
  });

  it('fills the always-mounted live region once the reset settles', async () => {
    let release!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderForm(onSubmit);

    expect(screen.getByTestId('reset-password-announcer').props.children).toBe('');

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');
    await act(async () => {
      release();
    });

    expect(screen.getByTestId('reset-password-announcer').props.children).toBe(
      'Password updated. Log in with your new password.',
    );
  });

  it('translates the bare 400 detail into "this link is not valid" and ends the form', async () => {
    // The real backend string (backend/app/routers/auth.py) — bare developer
    // copy, not something to show verbatim.
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(400, 'Invalid verification token'));
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(
      await screen.findByText(
        "This reset link isn't valid. Check that you copied the full link from your email, or request a new one.",
      ),
    ).toBeOnTheScreen();
    // No point keeping the fields: nothing typed into them can revive the token.
    expect(screen.queryByLabelText('New password')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Request a new link')).toBeOnTheScreen();
  });

  it('translates the bare 422 detail into "this link has expired" and ends the form', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new ApiError(422, 'Verification token has expired or already been used'),
      );
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(
      await screen.findByText(
        'This reset link has expired or has already been used. Request a new one to try again.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('reset-password-announcer').props.children).toBe(
      'We couldn’t reset that password. This reset link has expired or has already been used. Request a new one to try again.',
    );

    await press('Log in');
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('keeps the form and what was typed when the request never reached the server', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new ApiError(0, "Couldn't reach the server. Check your connection and try again."),
      );
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('New password').props.value).toBe('new-passphrase');

    // The same button retries; nothing has to be retyped.
    await press('Save new password');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('falls back to a generic message for a non-API failure, on the form', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(
      await screen.findByText('Something went wrong setting your password. Please try again.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Save new password')).toBeOnTheScreen();
  });

  it('falls back to a generic message for an unexpected API status', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(
      await screen.findByText('Something went wrong setting your password. Please try again.'),
    ).toBeOnTheScreen();
  });

  it('shows a busy button while the reset is in flight', async () => {
    let release!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await renderForm(onSubmit);

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(await screen.findByText('Saving…')).toBeOnTheScreen();

    await act(async () => {
      release();
    });

    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeOnTheScreen());
  });

  it('toggles password visibility for both fields at once', async () => {
    await renderForm();

    expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Confirm new password').props.secureTextEntry).toBe(true);

    await press('Show password');

    await waitFor(() =>
      expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(false),
    );
    expect(screen.getByLabelText('Confirm new password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Hide password')).toBeOnTheScreen();
  });

  it('moves focus on from the password field without disturbing the entered value', async () => {
    await renderForm();

    await type('New password', 'new-passphrase');
    await act(async () => {
      fireEvent(screen.getByLabelText('New password'), 'submitEditing');
    });

    expect(screen.getByLabelText('New password').props.value).toBe('new-passphrase');
  });

  it('does nothing on a valid submit when no handler is wired', async () => {
    await renderForm();

    await type('New password', 'new-passphrase');
    await type('Confirm new password', 'new-passphrase');
    await press('Save new password');

    expect(screen.getByText('Set a new password')).toBeOnTheScreen();
    expect(screen.queryByText('Password updated')).not.toBeOnTheScreen();
  });
});
