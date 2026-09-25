import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import type { AppState, UpdateState } from "../domain/contracts";
import { invoke } from "./api";
import releaseNotes from "../../release-notes.json";

export function Brand({ developer = false }: { developer?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
        <span />
      </span>
      <div>
        omni<span className="brand-pos">pos</span>
        {developer && <small>DEVELOPER CONSOLE</small>}
      </div>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Store size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Notice({
  children,
  error = false,
  onClose,
}: {
  children: ReactNode;
  error?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
      {onClose && (
        <button
          className="icon-button"
          aria-label="Dismiss message"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Busy({ children = "Saving…" }: { children?: ReactNode }) {
  return (
    <>
      <LoaderCircle size={16} className="spin" />
      {children}
    </>
  );
}
export function Login({
  state,
  onState,
}: {
  state: AppState;
  onState: (s: AppState) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const developer = state.kind === "developer";
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onState(
        await invoke<AppState>({
          action: "auth.login",
          credentials: { email, password },
        }),
      );
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-story">
        <Brand developer={developer} />
        <div>
          <span className="eyebrow light">
            {developer
              ? "YOUR BUSINESS. YOUR CONTROL."
              : "A BETTER DAY AT THE COUNTER."}
          </span>
          <h1>
            {developer ? (
              <>
                One console.
                <br />
                Every client.
              </>
            ) : (
              <>
                Small moments.
                <br />
                Great business.
              </>
            )}
          </h1>
          <p>
            {developer
              ? "Give every business the right tools, manage access, and keep your clients moving."
              : "A focused workspace for your products, payments, and the people who keep coming back."}
          </p>
        </div>
        <div className="login-promise">
          <ShieldCheck size={20} />
          <span>Secure access. Built for your business.</span>
        </div>
      </section>
      <main className="login-panel">
        <div className="login-card">
          <div className="feature-icon">
            <KeyRound size={25} />
          </div>
          <span className="eyebrow">
            {developer ? "DEVELOPER ACCESS" : "WELCOME BACK"}
          </span>
          <h2>
            {state.configured
              ? "Sign in to your workspace"
              : "Let’s connect your workspace"}
          </h2>
          <p>
            {state.configured
              ? developer
                ? "Use your authorized developer account."
                : "Enter the account provided by your developer."
              : "Your application is installed. Cloud setup is the next step."}
          </p>
          {!state.configured ? (
            <>
              <div className="setup-list">
                <div>
                  <Check size={17} />
                  Windows application installed
                </div>
                <div>
                  <Check size={17} />
                  Local database ready
                </div>
                {state.missing.map((m) => (
                  <div key={m}>
                    <span className="step-dot" />
                    {m} required
                  </div>
                ))}
              </div>
              <p className="muted">
                Complete the deployment guide in <code>docs/SETUP.md</code>,
                then build with your public project settings. Secret keys belong
                only on the server.
              </p>
              <button
                className="button secondary wide"
                onClick={async () =>
                  onState(await invoke<AppState>({ action: "app.state" }))
                }
              >
                <RefreshCw size={16} />
                Check connection
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </label>
              {error && <Notice error>{error}</Notice>}
              <button disabled={busy} className="button primary wide">
                {busy ? (
                  <Busy>Signing in…</Busy>
                ) : (
                  <>
                    Sign in
                    <ArrowUpRight size={18} />
                  </>
                )}
              </button>
              <p className="form-note">
                {developer
                  ? "Access is verified against the developer allowlist."
                  : "Need access or a renewal? Contact your developer."}
              </p>
            </form>
          )}
          <div className="login-footer">
            OmniPOS {state.version}
            <span>{developer ? "Developer console" : "Point of sale"}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
export function UpdatePanel({
  state,
  cartEmpty = true,
  showPassword = true,
}: {
  state: AppState;
  cartEmpty?: boolean;
  showPassword?: boolean;
}) {
  const [update, setUpdate] = useState<UpdateState>(state.update),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(
    type:
      "update.check" | "update.download" | "update.install" | "update.defer",
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await invoke<UpdateState>(
        type === "update.install"
          ? { action: type, cartEmpty }
          : { action: type },
      );
      if (result) setUpdate(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = setInterval(() => {
      void invoke<AppState>({ action: "app.state" })
        .then((s) => setUpdate(s.update))
        .catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="update-layout">
      <section className="card update-card">
        <div className="feature-icon">
          <Download size={25} />
        </div>
        <span className="eyebrow">SOFTWARE UPDATES</span>
        <h2>Keep your workspace current.</h2>
        <p>
          Improvements and patches are delivered from your developer’s GitHub
          releases.
        </p>
        <div className="version-row">
          <span>Installed version</span>
          <strong>{state.version}</strong>
        </div>
        <div className="version-row">
          <span>Application channel</span>
          <Badge tone="teal">{state.kind}</Badge>
        </div>
        <div className="version-row">
          <span>Repository</span>
          <strong>CharlesManalo / OmniPOS</strong>
        </div>
        {update.version && (
          <div className="version-row">
            <span>Release policy</span>
            <Badge tone={update.required ? "amber" : "teal"}>
              {update.required ? "Required" : "Optional / up to date"}
            </Badge>
          </div>
        )}
        {state.kind === "pos" && (
          <label className="update-preference">
            <input
              type="checkbox"
              checked={update.autoOptional ?? false}
              onChange={async (e) => {
                try {
                  setUpdate(
                    await invoke<UpdateState>({
                      action: "update.preferences",
                      autoOptional: e.target.checked,
                    }),
                  );
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            />
            Automatically download and install optional updates when no sale is
            open
          </label>
        )}
        <Notice>
          {update.message}
          {update.progress !== undefined && ` ${update.progress}%`}
        </Notice>
        {error && <Notice error>{error}</Notice>}
        <div className="button-row">
          <button
            disabled={busy || update.status === "downloading"}
            className="button primary"
            onClick={() => action("update.check")}
          >
            {busy ? (
              <Busy />
            ) : (
              <>
                <RefreshCw size={16} />
                Check for updates
              </>
            )}
          </button>
          {update.status === "available" && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => action("update.download")}
            >
              <Download size={16} />
              Update now · {update.version}
            </button>
          )}
          {update.status === "ready" && (
            <button
              disabled={!cartEmpty || busy}
              className="button secondary"
              onClick={() => action("update.install")}
            >
              Install & restart
            </button>
          )}
          {update.status === "ready" &&
            !update.required &&
            state.kind === "pos" && (
              <button
                className="button secondary"
                onClick={() => action("update.defer")}
              >
                Later
              </button>
            )}
        </div>
        <p className="form-note">
          {state.kind === "pos"
            ? "Selected updates close and reopen the app after a 15-second notice, when no sale is open. Required updates block new sales; optional updates can wait."
            : "Finish any changes before installing. The application closes and reopens after installation."}
        </p>
        {update.releaseNotes && (
          <details className="release-notes">
            <summary>Patch notes for {update.version}</summary>
            <pre>{update.releaseNotes}</pre>
          </details>
        )}
      </section>
      {showPassword && <PasswordPanel />}
    </div>
  );
}
export function UpdateGate({ state }: { state: AppState }) {
  return (
    <main className="required-update-page">
      <Brand developer={state.kind === "developer"} />
      <h1>A required update is ready for your workspace.</h1>
      <p>
        Your saved products and sales remain on this computer. Connect to
        download the update and continue.
      </p>
      <UpdatePanel state={state} showPassword={false} />
    </main>
  );
}
export function UpdateNotice({
  state,
  onOpen,
}: {
  state: AppState;
  onOpen: () => void;
}) {
  const u = state.update;
  if (!["available", "downloading", "ready"].includes(u.status) && !u.required)
    return null;
  return (
    <div className="update-banner" role="status">
      <div>
        <strong>
          {u.required ? "Required update" : "Software update"}
          {u.version && ` · ${u.version}`}
        </strong>
        <span>
          {u.message}
          {u.progress !== undefined && ` ${u.progress}%`}
        </span>
      </div>
      <button className="button secondary" onClick={onOpen}>
        View update
      </button>
    </div>
  );
}
export function WhatsNew({ version }: { version: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="whats-new" onClick={() => setOpen(true)}>
        <span>What’s new</span>
        <small>v{version} · Patch notes</small>
      </button>
      {open && (
        <Modal
          title={`What’s new · v${releaseNotes.version}`}
          subtitle={releaseNotes.title}
          onClose={() => setOpen(false)}
        >
          <div className="patch-document">
            {releaseNotes.sections.map((section) => (
              <section key={section.title}>
                <h3>{section.title}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function PasswordPanel() {
  const [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await invoke({ action: "auth.password", password });
      setMessage("Password updated.");
      setError(false);
      setPassword("");
    } catch (e) {
      setMessage((e as Error).message);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h3>Account security</h3>
      <p className="muted">Choose a unique password for this account.</p>
      <form onSubmit={submit}>
        <label>
          New password
          <input
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && <Notice error={error}>{message}</Notice>}
        <button disabled={busy} className="button secondary">
          {busy ? <Busy /> : "Change password"}
        </button>
      </form>
    </section>
  );
}
