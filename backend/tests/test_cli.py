"""Tests for app.cli: password bootstrap/prompting, superuser upsert, and arg parsing."""

import argparse
import json
import uuid
from pathlib import Path

import pytest
from argon2 import PasswordHasher

from app import cli
from app.models import AuthIdentity, User
from tests.fakes import FakeSession as _FakeSession


def _fake_getpass(monkeypatch: pytest.MonkeyPatch, responses: list[str]) -> None:
    """Patch ``cli.getpass.getpass`` to return ``responses`` in order, one per call.

    :param monkeypatch: The active pytest monkeypatch fixture.
    :type monkeypatch: pytest.MonkeyPatch
    :param responses: The values successive ``getpass`` prompts should return.
    :type responses: list[str]
    """
    queued = list(responses)

    def _fake(_prompt: str = "") -> str:
        """Return the next scripted response.

        :param _prompt: Ignored prompt text.
        :type _prompt: str
        :raises AssertionError: If called more often than the test scripted.
        :returns: The next queued response.
        :rtype: str
        """
        assert queued, "code under test called getpass more times than the test scripted"
        return queued.pop(0)

    monkeypatch.setattr(cli.getpass, "getpass", _fake)


async def test_ensure_superuser_creates_new_user_with_password() -> None:
    """Verify a brand-new email gets a superuser row plus a password identity."""
    session = _FakeSession(execute_results=[None, None])

    user, created = await cli.ensure_superuser(session, "root@example.com", "hashed-pw")

    assert created is True
    assert user.email == "root@example.com"
    assert user.is_superuser is True
    assert user.email_verified is True
    assert session.committed is True
    assert len(session.added) == 2

    identity = session.added[1]
    assert isinstance(identity, AuthIdentity)
    assert identity.provider == "password"
    assert identity.provider_user_id == str(user.id)
    assert identity.secret_hash == "hashed-pw"


async def test_ensure_superuser_creates_new_user_without_password() -> None:
    """Verify a Google-only bootstrap creates the user but no auth identity."""
    session = _FakeSession(execute_results=[None])

    user, created = await cli.ensure_superuser(session, "root@example.com", None)

    assert created is True
    assert user.is_superuser is True
    assert session.added == [user]
    assert session.committed is True


async def test_ensure_superuser_promotes_existing_user() -> None:
    """Verify an existing account is promoted in place, not duplicated."""
    existing = User(email="root@example.com", is_superuser=False, email_verified=True)
    existing.id = uuid.uuid4()
    session = _FakeSession(execute_results=[existing])

    user, created = await cli.ensure_superuser(session, "root@example.com", None)

    assert created is False
    assert user is existing
    assert user.is_superuser is True
    assert session.added == []
    assert session.committed is True


async def test_ensure_superuser_rotates_existing_password_identity() -> None:
    """Verify re-running with a new password updates the existing identity in place."""
    existing_user = User(email="root@example.com", is_superuser=True, email_verified=True)
    existing_user.id = uuid.uuid4()
    existing_identity = AuthIdentity(
        user_id=existing_user.id,
        provider="password",
        provider_user_id=str(existing_user.id),
        secret_hash="old-hash",
    )
    session = _FakeSession(execute_results=[existing_user, existing_identity])

    await cli.ensure_superuser(session, "root@example.com", "new-hash")

    assert existing_identity.secret_hash == "new-hash"
    assert session.added == []


async def test_run_create_superuser_reports_new_account_with_password(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify a new account created with a password hash announces the password identity."""
    session = _FakeSession(execute_results=[None, None])

    await cli._run_create_superuser(  # pylint: disable=protected-access
        session, "root@example.com", "argon2-hash"
    )

    assert session.added[1].secret_hash == "argon2-hash"
    out = capsys.readouterr().out
    assert "Created superuser root@example.com" in out
    assert "with a password identity" in out


async def test_run_create_superuser_reports_new_google_only_account(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify a new passwordless account is reported as Google-only."""
    session = _FakeSession(execute_results=[None])

    await cli._run_create_superuser(session, "root@example.com", None)  # pylint: disable=protected-access

    assert session.added[0].is_superuser is True
    assert "for Google-only login" in capsys.readouterr().out


async def test_run_create_superuser_promotion_without_password_leaves_identities_alone(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify promoting an existing account with no new password doesn't claim it's Google-only."""
    existing = User(email="root@example.com", is_superuser=False, email_verified=True)
    existing.id = uuid.uuid4()
    session = _FakeSession(execute_results=[existing])

    await cli._run_create_superuser(session, "root@example.com", None)  # pylint: disable=protected-access

    assert session.added == []
    out = capsys.readouterr().out
    assert "Promoted superuser root@example.com" in out
    assert "leaving its auth identities unchanged" in out


async def test_run_create_superuser_promotion_with_password_reports_identity(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify promoting an existing account with a new password announces the password identity."""
    existing = User(email="root@example.com", is_superuser=False, email_verified=True)
    existing.id = uuid.uuid4()
    session = _FakeSession(execute_results=[existing, None])

    await cli._run_create_superuser(  # pylint: disable=protected-access
        session, "root@example.com", "argon2-hash"
    )

    out = capsys.readouterr().out
    assert "Promoted superuser root@example.com" in out
    assert "with a password identity" in out


def test_hash_password_round_trips_via_argon2() -> None:
    """Verify ``hash_password`` produces a hash argon2 itself can verify."""
    hashed = cli.hash_password("correct horse battery staple")

    assert PasswordHasher().verify(hashed, "correct horse battery staple")


def test_hash_password_salts_each_call_differently() -> None:
    """Verify two hashes of the same password aren't identical (random salt)."""
    assert cli.hash_password("same-password") != cli.hash_password("same-password")


def test_read_bootstrap_password_non_tty_defaults_to_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify no env vars and no terminal means a Google-only bootstrap (no prompt)."""
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.delenv("SUPERUSER_PASSWORD_FILE", raising=False)
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: False)

    assert cli.read_bootstrap_password() is None


def test_read_bootstrap_password_never_prompts_without_a_tty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify automation without env vars gets ``None`` and is never blocked on a prompt."""
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.delenv("SUPERUSER_PASSWORD_FILE", raising=False)
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: False)
    monkeypatch.setattr(
        cli.getpass, "getpass", lambda _prompt="": pytest.fail("prompted in non-interactive mode")
    )

    assert cli.read_bootstrap_password() is None


def test_read_bootstrap_password_prompts_when_interactive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify an interactive run with no env vars prompts for the password and confirms it."""
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.delenv("SUPERUSER_PASSWORD_FILE", raising=False)
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)
    _fake_getpass(monkeypatch, ["hunter2", "hunter2"])

    assert cli.read_bootstrap_password() == "hunter2"


def test_prompt_bootstrap_password_blank_selects_google_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify submitting an empty password at the prompt means a Google-only account."""
    _fake_getpass(monkeypatch, [""])

    assert cli._prompt_bootstrap_password() is None  # pylint: disable=protected-access


def test_prompt_bootstrap_password_whitespace_only_selects_google_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify a whitespace-only entry is treated as blank, like a whitespace-only env var."""
    _fake_getpass(monkeypatch, ["   "])

    assert cli._prompt_bootstrap_password() is None  # pylint: disable=protected-access


def test_prompt_bootstrap_password_reprompts_on_mismatch(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Verify a mismatched confirmation re-prompts rather than accepting the first entry."""
    _fake_getpass(monkeypatch, ["typo", "TYPO", "right", "right"])

    assert cli._prompt_bootstrap_password() == "right"  # pylint: disable=protected-access
    assert "didn't match" in capsys.readouterr().err


def test_prompt_bootstrap_password_aborts_cleanly_on_interrupt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify Ctrl-C at the password prompt exits cleanly, not with a raw traceback."""

    def _raise_interrupt(_prompt: str = "") -> str:
        """Simulate the user pressing Ctrl-C.

        :param _prompt: Ignored prompt text.
        :type _prompt: str
        :raises KeyboardInterrupt: Always.
        """
        raise KeyboardInterrupt

    monkeypatch.setattr(cli.getpass, "getpass", _raise_interrupt)

    with pytest.raises(SystemExit, match="Aborted"):
        cli._prompt_bootstrap_password()  # pylint: disable=protected-access


def test_read_bootstrap_password_prefers_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify ``SUPERUSER_PASSWORD`` wins over ``SUPERUSER_PASSWORD_FILE`` when both are set."""
    monkeypatch.setenv("SUPERUSER_PASSWORD", "from-env")
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", "/nonexistent/path")

    assert cli.read_bootstrap_password() == "from-env"


def test_read_bootstrap_password_reads_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Verify the password file is read and stripped when the env var is unset."""
    password_file = tmp_path / "superuser_password"
    password_file.write_text("from-file\n", encoding="utf-8")
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", str(password_file))

    assert cli.read_bootstrap_password() == "from-file"


def test_read_bootstrap_password_missing_file_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify a ``SUPERUSER_PASSWORD_FILE`` pointing nowhere raises, not silently None."""
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", "/nonexistent/path")

    with pytest.raises(ValueError, match="SUPERUSER_PASSWORD_FILE"):
        cli.read_bootstrap_password()


def test_read_bootstrap_password_whitespace_env_var_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify a whitespace-only ``SUPERUSER_PASSWORD`` raises instead of a blank password."""
    monkeypatch.setenv("SUPERUSER_PASSWORD", "   ")

    with pytest.raises(ValueError, match="SUPERUSER_PASSWORD"):
        cli.read_bootstrap_password()


def test_read_bootstrap_password_unreadable_file_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Verify a ``SUPERUSER_PASSWORD_FILE`` that exists but can't be read as text raises cleanly."""
    # A directory exists but can't be read as text — read_text() raises an
    # OSError subclass (IsADirectoryError on POSIX, PermissionError on
    # Windows), which should surface as the same clear ValueError as a
    # missing file, not a raw OSError traceback.
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", str(tmp_path))

    with pytest.raises(ValueError, match="Could not read SUPERUSER_PASSWORD_FILE"):
        cli.read_bootstrap_password()


def test_read_bootstrap_password_non_utf8_file_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Verify a non-UTF-8 password file raises the same clean error, not a raw codec error."""
    password_file = tmp_path / "superuser_password"
    password_file.write_bytes("secret".encode("utf-16"))
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", str(password_file))

    with pytest.raises(ValueError, match="Could not read SUPERUSER_PASSWORD_FILE"):
        cli.read_bootstrap_password()


def test_read_bootstrap_password_empty_file_raises(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Verify a whitespace-only password file raises instead of yielding a blank password."""
    password_file = tmp_path / "superuser_password"
    password_file.write_text("   \n", encoding="utf-8")
    monkeypatch.delenv("SUPERUSER_PASSWORD", raising=False)
    monkeypatch.setenv("SUPERUSER_PASSWORD_FILE", str(password_file))

    with pytest.raises(ValueError, match="empty"):
        cli.read_bootstrap_password()


@pytest.mark.parametrize(
    "email",
    ["root@example.com", "first.last@sub.example.com"],
)
def test_email_arg_accepts_valid_addresses(email: str) -> None:
    """Verify plausible email addresses pass validation unchanged."""
    assert cli._email_arg(email) == email  # pylint: disable=protected-access


@pytest.mark.parametrize(
    "email",
    [
        "not-an-email",
        "@example.com",
        "root@",
        "root@@example.com",
        " root@example.com",
        "root@example.com ",
        "root@ example.com",
        "ro ot@example.com",
        "root@example. com",
        "root@localhost",
        "root@.com",
    ],
)
def test_email_arg_rejects_malformed_addresses(email: str) -> None:
    """Verify obviously-malformed addresses are rejected before hitting the DB."""
    with pytest.raises(argparse.ArgumentTypeError):
        cli._email_arg(email)  # pylint: disable=protected-access


def test_build_arg_parser_rejects_malformed_email() -> None:
    """Verify the parser itself surfaces the email validation as a usage error."""
    with pytest.raises(SystemExit):
        cli.build_arg_parser().parse_args(["create-superuser", "--email", "not-an-email"])


def test_build_arg_parser_parses_create_superuser() -> None:
    """Verify ``create-superuser --email ...`` parses as expected."""
    args = cli.build_arg_parser().parse_args(["create-superuser", "--email", "root@example.com"])

    assert args.command == "create-superuser"
    assert args.email == "root@example.com"


def test_build_arg_parser_email_is_optional() -> None:
    """Verify omitting ``--email`` parses to ``None`` (``main`` prompts for it later)."""
    args = cli.build_arg_parser().parse_args(["create-superuser"])

    assert args.command == "create-superuser"
    assert args.email is None


def test_parser_prints_full_help_when_no_command(capsys: pytest.CaptureFixture[str]) -> None:
    """Verify invoking with no subcommand prints the full help, not just a usage line."""
    with pytest.raises(SystemExit) as exc_info:
        cli.build_arg_parser().parse_args([])

    assert exc_info.value.code == 2
    err = capsys.readouterr().err
    assert "create-superuser" in err
    assert "The superuser's email address." not in err  # subcommand help stays nested
    assert "error:" in err


def test_main_errors_when_email_missing_and_non_interactive(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Verify a non-interactive run without ``--email`` fails loudly instead of prompting."""
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: False)

    with pytest.raises(SystemExit) as exc_info:
        cli.main(["create-superuser"])

    assert exc_info.value.code == 2
    err = capsys.readouterr().err
    assert "--email is required" in err
    assert "usage:" in err


def test_main_prompts_for_email_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify an interactive run without ``--email`` prompts, then dispatches the entry."""
    calls: list[str] = []

    async def fake_create_superuser(email: str) -> None:
        """Record the email ``main`` resolved.

        :param email: The email ``main`` dispatched.
        :type email: str
        """
        calls.append(email)

    monkeypatch.setattr(cli, "_create_superuser", fake_create_superuser)
    monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr(cli, "_prompt_email", lambda: "prompted@example.com")

    assert cli.main(["create-superuser"]) == 0
    assert calls == ["prompted@example.com"]


def test_prompt_email_accepts_first_valid_entry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify a plausible address entered at the prompt is returned as-is."""
    monkeypatch.setattr("builtins.input", lambda _prompt="": "  root@example.com  ")

    assert cli._prompt_email() == "root@example.com"  # pylint: disable=protected-access


def test_prompt_email_reprompts_until_valid(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Verify a malformed entry re-prompts rather than creating an un-loggable-into row."""
    entries = iter(["not-an-email", "root@example.com"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(entries))

    assert cli._prompt_email() == "root@example.com"  # pylint: disable=protected-access
    assert "not a valid email address" in capsys.readouterr().err


def test_prompt_email_aborts_cleanly_on_eof(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify Ctrl-D at the email prompt exits cleanly, not with a raw traceback."""

    def _raise_eof(_prompt: str = "") -> str:
        """Simulate the user pressing Ctrl-D.

        :param _prompt: Ignored prompt text.
        :type _prompt: str
        :raises EOFError: Always.
        """
        raise EOFError

    monkeypatch.setattr("builtins.input", _raise_eof)

    with pytest.raises(SystemExit, match="Aborted"):
        cli._prompt_email()  # pylint: disable=protected-access


def test_main_dispatches_create_superuser(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify ``main`` wires parsed args through to ``_create_superuser``."""
    calls = []

    async def fake_create_superuser(email: str) -> None:
        """Record the email it was called with instead of touching the DB.

        :param email: The email ``main`` dispatched.
        :type email: str
        """
        calls.append(email)

    monkeypatch.setattr(cli, "_create_superuser", fake_create_superuser)

    exit_code = cli.main(["create-superuser", "--email", "root@example.com"])

    assert exit_code == 0
    assert calls == ["root@example.com"]


def test_build_arg_parser_parses_export_openapi_with_default_output() -> None:
    """Verify ``export-openapi`` parses and defaults ``--output`` to the repo-root path."""
    args = cli.build_arg_parser().parse_args(["export-openapi"])

    assert args.command == "export-openapi"
    assert args.output == cli._DEFAULT_OPENAPI_OUTPUT  # pylint: disable=protected-access


def test_build_arg_parser_parses_export_openapi_with_custom_output(tmp_path: Path) -> None:
    """Verify ``--output`` overrides the default path."""
    custom_path = tmp_path / "schema.json"

    args = cli.build_arg_parser().parse_args(["export-openapi", "--output", str(custom_path)])

    assert args.output == custom_path


def test_export_openapi_writes_valid_schema(tmp_path: Path) -> None:
    """Verify ``_export_openapi`` writes the app's real OpenAPI schema as JSON."""
    output_path = tmp_path / "nested" / "openapi.json"

    overwrote = cli._export_openapi(output_path)  # pylint: disable=protected-access

    assert overwrote is False
    written = json.loads(output_path.read_text(encoding="utf-8"))
    assert written["info"]["title"] == "Pantrycast API"
    assert "/auth/login" in written["paths"]
    assert "/users/me" in written["paths"]


def test_export_openapi_reports_overwrite_of_an_existing_file(tmp_path: Path) -> None:
    """Verify re-running against an already-existing path reports it as overwritten."""
    output_path = tmp_path / "openapi.json"
    output_path.write_text("stale contents", encoding="utf-8")

    overwrote = cli._export_openapi(output_path)  # pylint: disable=protected-access

    assert overwrote is True
    assert "stale contents" not in output_path.read_text(encoding="utf-8")


def test_main_dispatches_export_openapi(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    """Verify ``main`` wires ``export-openapi`` through to ``_export_openapi`` and reports it."""
    calls = []
    output_path = tmp_path / "openapi.json"

    def fake_export_openapi(path: Path) -> bool:
        """Record the path it was called with instead of writing a file.

        :param path: The output path ``main`` dispatched.
        :type path: Path
        :returns: ``False`` — pretends the file didn't already exist.
        :rtype: bool
        """
        calls.append(path)
        return False

    monkeypatch.setattr(cli, "_export_openapi", fake_export_openapi)

    exit_code = cli.main(["export-openapi", "--output", str(output_path)])

    assert exit_code == 0
    assert calls == [output_path]
    output = capsys.readouterr().out
    assert "Wrote" in output
    assert str(output_path) in output


def test_main_reports_overwrite_for_export_openapi(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    """Verify ``main`` says "Overwrote" (not "Wrote") when the file already existed."""
    output_path = tmp_path / "openapi.json"
    monkeypatch.setattr(cli, "_export_openapi", lambda _path: True)

    cli.main(["export-openapi", "--output", str(output_path)])

    assert "Overwrote" in capsys.readouterr().out
