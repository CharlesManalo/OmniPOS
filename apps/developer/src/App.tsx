import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import {
  businessTypes,
  moduleNames,
  plans,
  roles,
  TenantInput,
  type AdminData,
  type AppState,
  type Command,
  type Tenant,
  type Role,
  type Entitlement,
} from "../../../packages/domain/contracts";
import { initialState, invoke } from "../../../packages/ui/api";
import {
  Badge,
  Brand,
  Busy,
  Empty,
  Login,
  Modal,
  Notice,
  UpdatePanel,
  UpdateGate,
} from "../../../packages/ui/components";

const blank: AdminData = { tenants: [], members: [], devices: [], audit: [] };
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["tenants", "Clients & tenants", Building2],
  ["subscriptions", "Subscriptions", CalendarClock],
  ["accounts", "Client accounts", Users],
  ["audit", "Activity log", Activity],
  ["updates", "Updates & account", Download],
] as const;
const formatDate = (v: string) =>
  new Date(v).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
function status(t: Tenant) {
  return t.status === "active" && new Date(t.paid_until).getTime() <= Date.now()
    ? "expired"
    : t.status;
}
function statusTone(t: Tenant) {
  const s = status(t);
  return s === "active"
    ? "teal"
    : s === "expired"
      ? "amber"
      : s === "deleted"
        ? "neutral"
        : "red";
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function DeveloperApp() {
  const [state, setState] = useState<AppState>({
      ...initialState,
      kind: "developer",
    }),
    [ready, setReady] = useState(false),
    [data, setData] = useState(blank),
    [page, setPage] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [edit, setEdit] = useState<Tenant | "new" | null>(null),
    [remove, setRemove] = useState<Tenant | null>(null),
    [newUser, setNewUser] = useState(false),
    [selected, setSelected] = useState<Tenant | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await invoke<AdminData>({ action: "admin.list" }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    invoke<AppState>({ action: "app.state" })
      .then(setState)
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    const timer = setInterval(() => {
      void invoke<AppState>({ action: "app.state" })
        .then(setState)
        .catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state.user) void load();
  }, [state.user?.id, load]);
  async function mutate(c: Command) {
    await invoke(c);
    await load();
    setMessage(
      "Changes saved. Connected terminals update on their next license check.",
    );
  }
  if (!ready)
    return (
      <div className="loading">
        <Busy>Opening developer console…</Busy>
      </div>
    );
  if (state.update.required) return <UpdateGate state={state} />;
  if (!state.user) return <Login state={state} onState={setState} />;
  const active = data.tenants.filter((t) => status(t) === "active"),
    expiring = active.filter(
      (t) => new Date(t.paid_until).getTime() < Date.now() + 7 * 86400000,
    ),
    expired = data.tenants.filter((t) => status(t) === "expired"),
    disabled = data.tenants.filter((t) => t.status === "disabled");
  const filtered = data.tenants.filter(
    (t) =>
      (filter === "all" ? t.status !== "deleted" : status(t) === filter) &&
      `${t.name} ${t.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const title = nav.find((n) => n[0] === page)?.[1] ?? "Overview";
  const run = (c: Command) => {
    setBusy(true);
    void mutate(c)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="app-shell developer">
      <aside className="sidebar">
        <Brand developer />
        <div className="workspace-chip">
          <span className="workspace-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            Developer workspace<small>Platform administrator</small>
          </div>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setSearch("");
              }}
            >
              <Icon size={19} />
              {label}
              {id === "subscriptions" && expiring.length > 0 && (
                <span className="nav-count">{expiring.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <ShieldCheck size={20} />
            <strong>You’re in control</strong>
            <p>
              Client access is managed securely by your cloud license service.
            </p>
          </div>
          <button
            className="profile-button"
            onClick={async () =>
              setState(await invoke<AppState>({ action: "auth.logout" }))
            }
          >
            <span className="avatar">CM</span>
            <span>
              Developer<small>{state.user.email}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="service-dot" />
            {state.preview ? "Design preview" : "Developer console"}
            <span className="divider" />
            <span>v{state.version}</span>
          </div>
        </header>
        <main className="page-content">
          {state.preview && (
            <Notice>
              Development preview · sample data only. Changes here do not affect
              Supabase.
            </Notice>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">OMNIPOS MANAGEMENT</span>
              <h1>
                {page === "overview" ? "Your businesses, at a glance." : title}
              </h1>
              <p>
                {page === "overview"
                  ? "A clear view of your clients, access, and upcoming renewals."
                  : page === "tenants"
                    ? "Create workspaces and tailor access to each business."
                    : page === "subscriptions"
                      ? "Set the right plan. Keep every renewal in sight."
                      : page === "accounts"
                        ? "Manage who can access each client workspace."
                        : page === "audit"
                          ? "A record of changes made across your platform."
                          : "Distribute improvements and keep your account secure."}
              </p>
            </div>
            {["overview", "tenants", "subscriptions"].includes(page) ? (
              <button className="button primary" onClick={() => setEdit("new")}>
                <Plus size={18} />
                New client
              </button>
            ) : page === "accounts" ? (
              <button
                className="button primary"
                disabled={!data.tenants.length}
                onClick={() => setNewUser(true)}
              >
                <Plus size={18} />
                Create account
              </button>
            ) : null}
          </div>
          {error && (
            <Notice error onClose={() => setError("")}>
              {error}
            </Notice>
          )}
          {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
          {page === "overview" && (
            <>
              <div className="stats-grid">
                {[
                  [
                    Building2,
                    "Total clients",
                    data.tenants.filter((t) => t.status !== "deleted").length,
                    "Across all business types",
                  ],
                  [
                    ShieldCheck,
                    "Active subscriptions",
                    active.length,
                    "Ready to do business",
                  ],
                  [
                    CalendarClock,
                    "Renewing soon",
                    expiring.length,
                    "Within the next 7 days",
                  ],
                  [
                    Pause,
                    "Access paused",
                    disabled.length + expired.length,
                    "Disabled or expired",
                  ],
                ].map(([Icon, label, value, foot], i) => {
                  const I = Icon as typeof Building2;
                  return (
                    <section className="stat-card" key={String(label)}>
                      <div>
                        <span>{String(label)}</span>
                        <span className={`stat-icon color-${i}`}>
                          <I size={20} />
                        </span>
                      </div>
                      <strong>{String(value).padStart(2, "0")}</strong>
                      <small>{String(foot)}</small>
                    </section>
                  );
                })}
              </div>
              <div className="overview-grid">
                <section className="card compact">
                  <div className="section-heading">
                    <div>
                      <h2>Client portfolio</h2>
                      <p>The latest businesses in your workspace</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("tenants")}
                    >
                      View all
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <TenantTable
                    tenants={data.tenants
                      .filter((t) => t.status !== "deleted")
                      .slice(0, 5)}
                    busy={busy}
                    onEdit={setEdit}
                    onSelect={setSelected}
                  />
                </section>
                <section className="card renewals-card">
                  <div className="section-heading">
                    <div>
                      <h2>Needs your attention</h2>
                      <p>Stay one step ahead</p>
                    </div>
                    <CalendarClock size={21} />
                  </div>
                  {[...expired, ...expiring].length === 0 ? (
                    <div className="all-good">
                      <Check size={26} />
                      <strong>All caught up</strong>
                      <p>No renewals due this week.</p>
                    </div>
                  ) : (
                    [...expired, ...expiring].slice(0, 4).map((t) => (
                      <button
                        className="renewal-item"
                        key={t.id}
                        onClick={() => setEdit(t)}
                      >
                        <span className="avatar warm">{initials(t.name)}</span>
                        <span>
                          <strong>{t.name}</strong>
                          <small>
                            {status(t) === "expired" ? "Expired" : "Renews"}{" "}
                            {formatDate(t.paid_until)}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))
                  )}
                  <div className="renewal-note">
                    <ShieldCheck size={17} />
                    <p>
                      Expired accounts are locked until you extend their paid
                      access.
                    </p>
                  </div>
                </section>
              </div>
              <section className="product-banner">
                <div className="banner-symbol">
                  <Package size={34} />
                </div>
                <div>
                  <span className="eyebrow">BUILT AROUND YOUR CLIENTS</span>
                  <h2>One platform. The right setup for every store.</h2>
                  <p>
                    Choose modules, set terminal limits, and manage access from
                    one place.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setPage("subscriptions")}
                >
                  Manage subscriptions
                  <ArrowUpRight size={17} />
                </button>
              </section>
            </>
          )}
          {(page === "tenants" || page === "subscriptions") && (
            <>
              <div className="filter-toolbar">
                <div className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Search clients"
                    placeholder="Search by business or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter client status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All current clients</option>
                  {["active", "expired", "disabled", "deleted"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={load}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              <section className="card compact">
                <TenantTable
                  tenants={filtered}
                  busy={busy}
                  onEdit={setEdit}
                  onSelect={setSelected}
                  onStatus={(t) =>
                    run({
                      action: "admin.status",
                      id: t.id,
                      status: t.status === "active" ? "disabled" : "active",
                    })
                  }
                  onDelete={setRemove}
                />
              </section>
              <p className="muted footer-note">
                Re-enabling a client preserves their renewal date. Deleted
                clients can be restored from the Deleted filter.
              </p>
            </>
          )}
          {page === "accounts" && (
            <section className="card compact">
              <div className="section-heading">
                <h2>Client accounts</h2>
                <Badge>{data.members.length} accounts</Badge>
              </div>
              {!data.members.length ? (
                <Empty title="No accounts yet">
                  Create a client to add the first account.
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Business</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <strong>{m.email}</strong>
                          </td>
                          <td>
                            {
                              data.tenants.find((t) => t.id === m.tenant_id)
                                ?.name
                            }
                          </td>
                          <td>
                            <select
                              aria-label={`Role for ${m.email}`}
                              value={m.role}
                              disabled={busy}
                              onChange={(e) =>
                                run({
                                  action: "admin.updateUser",
                                  id: m.id,
                                  role: e.target.value as Role,
                                  enabled: m.enabled,
                                })
                              }
                            >
                              {roles.map((r) => (
                                <option key={r}>{r}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <Badge tone={m.enabled ? "teal" : "red"}>
                              {m.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </td>
                          <td>
                            <button
                              disabled={busy}
                              className="button small secondary"
                              onClick={() =>
                                run({
                                  action: "admin.updateUser",
                                  id: m.id,
                                  role: m.role,
                                  enabled: !m.enabled,
                                })
                              }
                            >
                              {m.enabled ? "Disable" : "Re-enable"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {page === "audit" && (
            <section className="card">
              <div className="section-heading">
                <h2>Recent activity</h2>
                <button className="text-button" onClick={load}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              {!data.audit.length ? (
                <Empty title="A fresh start">
                  Tenant and account changes will appear here.
                </Empty>
              ) : (
                data.audit.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-icon">
                      <Activity size={18} />
                    </span>
                    <div>
                      <strong>
                        {a.action
                          .replace("admin.", "")
                          .replace(/([A-Z])/g, " $1")}
                      </strong>
                      <p>
                        {data.tenants.find((t) => t.id === a.tenant_id)?.name ??
                          "Platform"}{" "}
                        · {a.actor_id.slice(0, 8)}
                      </p>
                    </div>
                    <time>{new Date(a.created_at).toLocaleString()}</time>
                  </div>
                ))
              )}
            </section>
          )}
          {page === "updates" && <UpdatePanel state={state} />}
          <footer className="page-footer">
            <span>OmniPOS Developer</span>
            <span>Made for the businesses you build.</span>
          </footer>
        </main>
      </div>
      {edit && (
        <TenantForm
          tenant={edit === "new" ? undefined : edit}
          onClose={() => setEdit(null)}
          onSave={async (c) => {
            await mutate(c);
            setEdit(null);
          }}
        />
      )}
      {remove && (
        <DeleteModal
          tenant={remove}
          onClose={() => setRemove(null)}
          onDelete={async (name) => {
            await mutate({
              action: "admin.status",
              id: remove.id,
              status: "deleted",
              confirmName: name,
            });
            setRemove(null);
          }}
        />
      )}
      {newUser && (
        <UserForm
          tenants={data.tenants.filter((t) => t.status !== "deleted")}
          onClose={() => setNewUser(false)}
          onSave={async (c) => {
            await mutate(c);
            setNewUser(false);
          }}
        />
      )}
      {selected && (
        <Modal
          title={selected.name}
          subtitle="Client workspace details"
          onClose={() => setSelected(null)}
        >
          <div className="details-grid">
            <label>
              Business type<strong>{selected.business_type}</strong>
            </label>
            <label>
              Plan<strong>{selected.plan}</strong>
            </label>
            <label>
              Paid until<strong>{formatDate(selected.paid_until)}</strong>
            </label>
            <label>
              Offline allowance
              <strong>{selected.offline_hours} hours maximum</strong>
            </label>
          </div>
          <h3>Enabled modules</h3>
          <div className="module-tags">
            {selected.modules.map((m) => (
              <Badge key={m}>{m}</Badge>
            ))}
          </div>
          <h3>Registered terminals</h3>
          {data.devices.filter((d) => d.tenant_id === selected.id).length ===
          0 ? (
            <p className="muted">Terminals appear after the client signs in.</p>
          ) : (
            data.devices
              .filter((d) => d.tenant_id === selected.id)
              .map((d) => (
                <div className="device-row" key={d.device_id}>
                  <code>{d.device_id.slice(0, 12)}</code>
                  <Badge tone={d.enabled ? "teal" : "red"}>
                    {d.enabled ? "Enabled" : "Revoked"}
                  </Badge>
                  <button
                    className="text-button danger-text"
                    disabled={!d.enabled || busy}
                    onClick={() =>
                      run({
                        action: "admin.revokeDevice",
                        tenantId: selected.id,
                        deviceId: d.device_id,
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                setEdit(selected);
                setSelected(null);
              }}
            >
              Edit subscription
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TenantTable({
  tenants,
  busy,
  onEdit,
  onSelect,
  onStatus,
  onDelete,
}: {
  tenants: Tenant[];
  busy: boolean;
  onEdit: (t: Tenant) => void;
  onSelect: (t: Tenant) => void;
  onStatus?: (t: Tenant) => void;
  onDelete?: (t: Tenant) => void;
}) {
  return !tenants.length ? (
    <Empty title="No clients found">
      Add your first business or change your filter.
    </Empty>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Renewal date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tenants.map((t, i) => (
            <tr key={t.id}>
              <td>
                <button className="business-cell" onClick={() => onSelect(t)}>
                  <span className={`avatar avatar-${i % 4}`}>
                    {initials(t.name)}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.business_type} · {t.max_terminals} terminal
                      {t.max_terminals > 1 ? "s" : ""}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span className="plan-label">{t.plan}</span>
              </td>
              <td>
                <Badge tone={statusTone(t)}>{status(t)}</Badge>
              </td>
              <td className="date-cell">{formatDate(t.paid_until)}</td>
              <td>
                <div className="table-actions">
                  <button
                    className="icon-button"
                    title="Edit or renew subscription"
                    aria-label={`Edit ${t.name}`}
                    disabled={busy || t.status === "deleted"}
                    onClick={() => onEdit(t)}
                  >
                    <Pencil size={16} />
                  </button>
                  {onStatus && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      title={
                        t.status === "active"
                          ? "Disable client"
                          : "Re-enable or restore client"
                      }
                      aria-label={`${t.status === "active" ? "Disable" : "Enable"} ${t.name}`}
                      onClick={() => onStatus(t)}
                    >
                      {t.status === "active" ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                  )}
                  {onDelete && t.status !== "deleted" && (
                    <button
                      className="icon-button danger-text"
                      disabled={busy}
                      title="Delete client"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => onDelete(t)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantForm({
  tenant,
  onClose,
  onSave,
}: {
  tenant?: Tenant;
  onClose: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const [modules, setModules] = useState<Entitlement[]>(
      tenant?.modules ?? plans.professional.modules,
    ),
    [plan, setPlan] = useState<TenantInput["plan"]>(
      tenant?.plan ?? "professional",
    ),
    [terminals, setTerminals] = useState(tenant?.max_terminals ?? 3),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const localDate = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const input = TenantInput.parse({
        name: f.get("name"),
        email: f.get("email"),
        business_type: f.get("business_type"),
        plan,
        paid_until: new Date(String(f.get("paid_until"))).toISOString(),
        offline_hours: Number(f.get("offline_hours")),
        max_terminals: terminals,
        modules,
      });
      await onSave(
        tenant
          ? { action: "admin.updateTenant", id: tenant.id, tenant: input }
          : {
              action: "admin.createTenant",
              tenant: input,
              account: {
                email: String(f.get("account_email")),
                password: String(f.get("password")),
                role: f.get("role") as Role,
              },
            },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        tenant ? "Edit client & subscription" : "Create a client workspace"
      }
      subtitle={
        tenant
          ? "Renew access, change the plan, or adjust available features."
          : "Set up the business and its first sign-in account."
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Business name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={tenant?.name}
              placeholder="e.g. Northside General Store"
            />
          </label>
          <label>
            Contact email
            <input
              name="email"
              type="email"
              required
              defaultValue={tenant?.email}
              placeholder="owner@business.com"
            />
          </label>
          <label>
            Business type
            <select
              name="business_type"
              defaultValue={tenant?.business_type ?? "retail"}
            >
              {businessTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Account plan
            <select
              value={plan}
              onChange={(e) => {
                const p = e.target.value as TenantInput["plan"];
                setPlan(p);
                setModules(plans[p].modules);
                setTerminals(plans[p].terminals);
              }}
            >
              {Object.keys(plans).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Paid access expires (local time)
            <input
              name="paid_until"
              type="datetime-local"
              required
              defaultValue={localDate(
                tenant?.paid_until ??
                  new Date(Date.now() + 30 * 86400000).toISOString(),
              )}
            />
          </label>
          <label>
            Terminal limit
            <input
              type="number"
              required
              min={1}
              max={100}
              value={terminals}
              onChange={(e) => setTerminals(Number(e.target.value))}
            />
          </label>
          <label>
            Offline allowance (hours)
            <input
              name="offline_hours"
              type="number"
              min={1}
              max={24}
              required
              defaultValue={tenant?.offline_hours ?? 24}
            />
          </label>
        </div>
        <fieldset>
          <legend>Included modules</legend>
          <div className="module-options">
            {moduleNames.map((m) => (
              <label key={m} className="check-option">
                <input
                  type="checkbox"
                  checked={modules.includes(m)}
                  disabled={m === "pos"}
                  onChange={(e) =>
                    setModules(
                      e.target.checked
                        ? [...modules, m]
                        : modules.filter((x) => x !== m),
                    )
                  }
                />
                <span>
                  {m === "pos"
                    ? "Point of sale"
                    : m === "gcash"
                      ? "GCash payments"
                      : m}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {!tenant && (
          <>
            <h3>First client account</h3>
            <div className="form-grid">
              <label>
                Sign-in email
                <input
                  name="account_email"
                  type="email"
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                Account role
                <select name="role">
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="full">
                Initial password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                />
              </label>
            </div>
            <p className="form-note">
              Share the credentials securely. The client can change their
              password after signing in.
            </p>
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <Busy /> : tenant ? "Save changes" : "Create client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function UserForm({
  tenants,
  onClose,
  onSave,
}: {
  tenants: Tenant[];
  onClose: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await onSave({
        action: "admin.createUser",
        tenantId: String(f.get("tenant")),
        account: {
          email: String(f.get("email")),
          password: String(f.get("password")),
          role: f.get("role") as Role,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Create client account"
      subtitle="The account can only access its assigned business."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Client workspace
          <select name="tenant">
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role">
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <Notice error>{error}</Notice>}
        <div className="modal-actions">
          <button disabled={busy} className="button primary">
            {busy ? <Busy /> : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DeleteModal({
  tenant,
  onClose,
  onDelete,
}: {
  tenant: Tenant;
  onClose: () => void;
  onDelete: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Delete this client?"
      subtitle="Access will be revoked. Sales and account history are retained, and you can restore the client later."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onDelete(name);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Type “{tenant.name}” to confirm
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && <Notice error>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={busy || name !== tenant.name}
            className="button danger"
          >
            {busy ? <Busy /> : "Delete client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
