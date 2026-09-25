import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  ChevronDown,
  Coffee,
  Download,
  History,
  LayoutGrid,
  LogOut,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Trash2,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  can,
  type AppState,
  type Product,
  type PosData,
  type Sale,
} from "../../../packages/domain/contracts";
import { peso, toCentavos } from "../../../packages/domain/money";
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
  UpdateNotice,
  WhatsNew,
} from "../../../packages/ui/components";
import { useCart } from "./cart";

export function PosApp() {
  const [state, setState] = useState<AppState>(initialState),
    [ready, setReady] = useState(false),
    [data, setData] = useState<PosData>({
      products: [],
      sales: [],
      pending: 0,
    }),
    [page, setPage] = useState("sell"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All products"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [product, setProduct] = useState<Product | "new" | null>(null),
    [paying, setPaying] = useState(false),
    [receipt, setReceipt] = useState<Sale | null>(null);
  const cart = useCart();
  const load = useCallback(async () => {
    try {
      setData(await invoke<PosData>({ action: "pos.state" }));
    } catch (e) {
      setError((e as Error).message);
      const s = await invoke<AppState>({ action: "app.state" });
      setState(s);
    }
  }, []);
  useEffect(() => {
    void invoke<AppState>({ action: "app.state" })
      .then(setState)
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
    const id = setInterval(() => {
      void invoke<AppState>({ action: "app.state" })
        .then(setState)
        .catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (state.license) void load();
  }, [state.license?.tenantId, load]);
  useEffect(() => {
    cart.clear();
  }, [state.user?.id]);
  const lic = state.license;
  if (!ready)
    return (
      <div className="loading">
        <Busy>Opening your workspace…</Busy>
      </div>
    );
  if (
    state.update.required &&
    !Object.keys(cart.items).length &&
    !receipt &&
    !paying
  )
    return <UpdateGate state={state} />;
  if (!state.user) return <Login state={state} onState={setState} />;
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setState(await invoke<AppState>({ action: "license.refresh" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!lic)
    return (
      <div className="locked-page">
        <Brand />
        <div className="card locked-card">
          <span className="feature-icon">
            <ShieldCheck size={30} />
          </span>
          <span className="eyebrow">ACCOUNT ACCESS</span>
          <h1>Your workspace is locked.</h1>
          <p>{state.blockedReason ?? "Connect to verify your subscription."}</p>
          <p className="muted">
            Contact your developer to renew or re-enable access. Previously
            saved sales remain on this device.
          </p>
          {error && <Notice error>{error}</Notice>}
          <button disabled={busy} className="button primary" onClick={refresh}>
            {busy ? (
              <Busy />
            ) : (
              <>
                <RefreshCw size={17} />
                Check access again
              </>
            )}
          </button>
          <button
            className="text-button"
            onClick={async () =>
              setState(await invoke<AppState>({ action: "auth.logout" }))
            }
          >
            Use another account
          </button>
        </div>
      </div>
    );
  const canInventory =
    can(lic.role, "inventory") && lic.modules.includes("inventory");
  const canSell = can(lic.role, "checkout") && lic.modules.includes("pos");
  const canReport = can(lic.role, "reports") && lic.modules.includes("reports");
  const items = Object.entries(cart.items).flatMap(([id, quantity]) => {
    const product = data.products.find((p) => p.id === id);
    return product ? [{ ...product, quantity }] : [];
  });
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const categories = [
    "All products",
    ...new Set(data.products.map((p) => p.category)),
  ];
  const filtered = data.products.filter(
    (p) =>
      (category === "All products" || p.category === category) &&
      `${p.name} ${p.barcode}`.toLowerCase().includes(search.toLowerCase()),
  );
  const icons = [ShoppingBag, Coffee, Package, ShoppingBasket];
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const result = await invoke<{ synced: number }>({ action: "pos.sync" });
      setMessage(`${result.synced} sales backed up.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pos-shell">
      <header className="pos-topbar">
        <Brand />
        <div className="store-identity">
          <Store size={18} />
          <div>
            <strong>{lic.tenantName}</strong>
            <small>Terminal {state.deviceId.slice(0, 6).toUpperCase()}</small>
          </div>
        </div>
        <div className="pos-topbar-right">
          <Badge tone={state.online ? "teal" : "amber"}>
            {state.online ? <Wifi size={13} /> : <WifiOff size={13} />}{" "}
            {state.online ? "Connected" : "Offline access"}
          </Badge>
          <span className="divider" />
          <span className="account-label">
            <strong>{lic.role}</strong>
            <small>{state.user.email}</small>
          </span>
          <button
            className="icon-button"
            title="Sign out"
            onClick={async () => {
              cart.clear();
              setState(await invoke<AppState>({ action: "auth.logout" }));
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <div className="pos-body">
        <aside className="pos-nav">
          {(
            [
              ["sell", "Point of sale", LayoutGrid],
              ["catalog", "Products", Package],
              ["history", "Sales history", History],
              ["updates", "Updates", Download],
            ] as const
          )
            .filter(([id]) => id !== "catalog" || canInventory)
            .map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          <div className="pos-nav-bottom">
            <WhatsNew version={state.version} />
            <ShieldCheck size={23} />
            <span>
              Licensed
              <br />
              workspace
            </span>
          </div>
        </aside>
        <main className={`pos-main ${page === "sell" ? "selling" : ""}`}>
          <UpdateNotice state={state} onOpen={() => setPage("updates")} />
          {state.preview && (
            <Notice>
              Development preview · sample products and payments. No real
              transactions.
            </Notice>
          )}
          {error && (
            <Notice error onClose={() => setError("")}>
              {error}
            </Notice>
          )}
          {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
          {page === "sell" && (
            <div className="sell-layout">
              <section className="catalog-area">
                <div className="catalog-heading">
                  <div>
                    <span className="eyebrow">YOUR COUNTER, SIMPLIFIED</span>
                    <h1>Let’s make a good sale.</h1>
                    <p>Find a product or scan its barcode to get started.</p>
                  </div>
                  <span className="today-label">
                    {new Date().toLocaleDateString("en-PH", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <form
                  className="search-field product-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p = data.products.find((p) => p.barcode === search);
                    if (p && canSell && p.stock > (cart.items[p.id] ?? 0)) {
                      void cart.add(p.id).catch((e) => setError(e.message));
                      setSearch("");
                    }
                  }}
                >
                  <Search size={19} />
                  <input
                    aria-label="Search products or scan barcode"
                    placeholder="Search products or scan barcode…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>Enter ↵</kbd>
                </form>
                <div className="category-tabs">
                  {categories.map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                      {c === "All products" && (
                        <span>{data.products.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="products-grid">
                  {filtered.map((p, i) => {
                    const Icon = icons[i % icons.length];
                    return (
                      <button
                        key={p.id}
                        className="product-card"
                        disabled={
                          !canSell || p.stock <= (cart.items[p.id] ?? 0)
                        }
                        onClick={() => {
                          void cart.add(p.id).catch((e) => setError(e.message));
                        }}
                      >
                        <div className={`product-art art-${i % 6}`}>
                          <span className="product-category">{p.category}</span>
                          <Icon size={52} strokeWidth={1.2} />
                          <span className="add-bubble">
                            <Plus size={18} />
                          </span>
                        </div>
                        <div className="product-info">
                          <h3>{p.name}</h3>
                          <div>
                            <strong>{peso(p.price)}</strong>
                            <span className={p.stock < 10 ? "low-stock" : ""}>
                              {p.stock} in stock
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!filtered.length && (
                  <Empty
                    title={
                      data.products.length
                        ? "No matching products"
                        : "Your shelves are ready"
                    }
                  >
                    {canInventory
                      ? "Open Products to add your catalog."
                      : "Ask your owner or developer to set up the product catalog."}
                  </Empty>
                )}
                <div className="catalog-bottom">
                  <ShieldCheck size={15} />
                  <span>
                    Sales saved locally · access valid until{" "}
                    {new Date(lic.exp * 1000).toLocaleString()}
                  </span>
                </div>
              </section>
              <aside className="order-panel">
                <div className="order-heading">
                  <div>
                    <h2>Current order</h2>
                    <span>
                      {items.reduce((s, i) => s + i.quantity, 0)} items
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Clear cart"
                    title="Clear cart"
                    disabled={!items.length}
                    onClick={() => cart.clear()}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="order-type">
                  <ShoppingBag size={16} />
                  <span>Counter sale</span>
                  <Badge>PHP</Badge>
                </div>
                <div className="cart-items">
                  {!items.length ? (
                    <div className="cart-empty">
                      <ShoppingBasket size={45} strokeWidth={1.2} />
                      <h3>A fresh start.</h3>
                      <p>
                        Add a product to begin
                        <br />
                        your next sale.
                      </p>
                    </div>
                  ) : (
                    items.map((i) => (
                      <div className="cart-item" key={i.id}>
                        <div className="cart-item-top">
                          <strong>{i.name}</strong>
                          <span>{peso(i.price * i.quantity)}</span>
                        </div>
                        <div className="cart-item-bottom">
                          <small>{peso(i.price)} each</small>
                          <div className="quantity-control">
                            <button
                              aria-label={`Remove one ${i.name}`}
                              onClick={() =>
                                cart.quantity(i.id, i.quantity - 1)
                              }
                            >
                              <Minus size={13} />
                            </button>
                            <span>{i.quantity}</span>
                            <button
                              disabled={i.quantity >= i.stock}
                              aria-label={`Add one ${i.name}`}
                              onClick={() =>
                                cart.quantity(i.id, i.quantity + 1)
                              }
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="order-totals">
                  <div>
                    <span>Subtotal</span>
                    <span>{peso(total)}</span>
                  </div>
                  <div>
                    <span>Additional charges</span>
                    <span>{peso(0)}</span>
                  </div>
                  <div className="grand-total">
                    <strong>Total</strong>
                    <strong>{peso(total)}</strong>
                  </div>
                  <button
                    className="button primary checkout-button"
                    disabled={!items.length || !canSell}
                    onClick={() => setPaying(true)}
                  >
                    Charge {peso(total)}
                    <ArrowRight size={19} />
                  </button>
                  <p>
                    <ShieldCheck size={13} />
                    Saved securely on this terminal
                  </p>
                </div>
              </aside>
            </div>
          )}
          {page === "catalog" && canInventory && (
            <div className="pos-inner-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR PRODUCT CATALOG</span>
                  <h1>Stocked for a great day.</h1>
                  <p>Manage products, prices, and this terminal’s inventory.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setProduct("new")}
                >
                  <Plus size={17} />
                  Add product
                </button>
              </div>
              <section className="card compact">
                {!data.products.length ? (
                  <Empty title="Add your first product">
                    Build your catalog to start selling.
                  </Empty>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Barcode</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Stock</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                            </td>
                            <td>
                              <code>{p.barcode}</code>
                            </td>
                            <td>{p.category}</td>
                            <td>{peso(p.price)}</td>
                            <td>
                              <Badge tone={p.stock < 10 ? "amber" : "teal"}>
                                {p.stock}
                              </Badge>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setProduct(p)}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
          {page === "history" && (
            <div className="pos-inner-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">TRANSACTIONS</span>
                  <h1>Every sale, accounted for.</h1>
                  <p>
                    {canReport
                      ? "Recent sales from this terminal."
                      : "Your recent sales from this terminal."}{" "}
                    {data.pending} awaiting cloud backup.
                  </p>
                </div>
                <div className="button-row">
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={sync}
                  >
                    <RefreshCw size={16} />
                    Back up sales
                  </button>
                  {canReport && (
                    <button
                      className="button primary"
                      onClick={() => {
                        void invoke({ action: "pos.export" }).catch((e) =>
                          setError(e.message),
                        );
                      }}
                    >
                      <Download size={16} />
                      Export
                    </button>
                  )}
                </div>
              </div>
              <section className="card compact">
                {!data.sales.length ? (
                  <Empty title="Your first sale is ahead">
                    Completed payments appear here, even when offline.
                  </Empty>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Receipt</th>
                          <th>Date</th>
                          <th>Payment</th>
                          <th>Items</th>
                          <th>Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.sales.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <code>{s.id.slice(0, 8).toUpperCase()}</code>
                            </td>
                            <td>{new Date(s.createdAt).toLocaleString()}</td>
                            <td>
                              <Badge>{s.method}</Badge>
                            </td>
                            <td>
                              {s.items.reduce((n, i) => n + i.quantity, 0)}
                            </td>
                            <td>
                              <strong>{peso(s.total)}</strong>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => setReceipt(s)}
                              >
                                View receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <p className="form-note">
                Cloud backups preserve sales; inventory is managed separately on
                each terminal in this release.
              </p>
            </div>
          )}
          {page === "updates" && (
            <div className="pos-inner-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR WORKSPACE</span>
                  <h1>Updates & account</h1>
                  <p>
                    Paid access until{" "}
                    {new Date(lic.paidUntil * 1000).toLocaleString()}.
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={refresh}
                >
                  <RefreshCw size={16} />
                  Verify license
                </button>
              </div>
              <UpdatePanel state={state} cartEmpty={!items.length} />
            </div>
          )}
        </main>
      </div>
      {product && (
        <ProductForm
          product={product === "new" ? undefined : product}
          onClose={() => setProduct(null)}
          onSave={async (p) => {
            await invoke({ action: "pos.product", product: p });
            setProduct(null);
            await load();
          }}
        />
      )}
      {paying && (
        <Payment
          id={cart.saleId!}
          total={total}
          gcash={lic.modules.includes("gcash")}
          items={items.map((i) => ({ productId: i.id, quantity: i.quantity }))}
          onClose={() => setPaying(false)}
          onPaid={async (sale) => {
            setPaying(false);
            cart.clear();
            setReceipt(sale);
            await load();
          }}
        />
      )}
      {receipt && (
        <Modal
          title="Sale complete"
          subtitle="The payment and stock movement are saved on this terminal."
          onClose={() => setReceipt(null)}
        >
          <div className="receipt">
            <div className="receipt-check">
              <Check size={26} />
            </div>
            <h2>{lic.tenantName}</h2>
            <p>TRANSACTION RECORD · {receipt.id.slice(0, 8).toUpperCase()}</p>
            <small>{new Date(receipt.createdAt).toLocaleString()}</small>
            <div className="receipt-lines">
              {receipt.items.map((i) => (
                <div key={i.productId}>
                  <span>
                    {i.quantity} × {i.name}
                  </span>
                  <strong>{peso(i.total)}</strong>
                </div>
              ))}
              <div className="receipt-total">
                <strong>Total</strong>
                <strong>{peso(receipt.total)}</strong>
              </div>
              <div>
                <span>Paid by {receipt.method}</span>
                <span>{peso(receipt.tendered)}</span>
              </div>
              <div>
                <span>Change</span>
                <span>{peso(receipt.change)}</span>
              </div>
              {receipt.reference && (
                <div>
                  <span>GCash reference · last 4</span>
                  <strong>{receipt.reference}</strong>
                </div>
              )}
            </div>
            <p className="form-note">
              Internal transaction record. Tax-compliant invoicing and printer
              integration require separate setup.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setReceipt(null)}>
              Back to counter
              <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ProductForm({
  product,
  onClose,
  onSave,
}: {
  product?: Product;
  onClose: () => void;
  onSave: (p: Product) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await onSave({
        id: product?.id ?? crypto.randomUUID(),
        name: String(f.get("name")),
        barcode: String(f.get("barcode")),
        category: String(f.get("category")),
        price: toCentavos(String(f.get("price"))),
        stock: Number(f.get("stock")),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? "Edit product" : "Add a product"}
      subtitle="Prices are entered in Philippine pesos."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Product name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={product?.name}
          />
        </label>
        <div className="form-grid">
          <label>
            Barcode / SKU
            <input
              name="barcode"
              required
              maxLength={80}
              defaultValue={product?.barcode}
            />
          </label>
          <label>
            Category
            <input
              name="category"
              required
              maxLength={60}
              defaultValue={product?.category ?? "General"}
            />
          </label>
          <label>
            Price (PHP)
            <input
              name="price"
              inputMode="decimal"
              required
              pattern="[0-9]+(\.[0-9]{1,2})?"
              defaultValue={product ? (product.price / 100).toFixed(2) : ""}
            />
          </label>
          <label>
            Stock on this terminal
            <input
              name="stock"
              type="number"
              min={0}
              max={1000000}
              required
              defaultValue={product?.stock ?? 0}
            />
          </label>
        </div>
        {error && <Notice error>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            {busy ? <Busy /> : "Save product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Payment({
  id,
  total,
  gcash,
  items,
  onClose,
  onPaid,
}: {
  id: string;
  total: number;
  gcash: boolean;
  items: { productId: string; quantity: number }[];
  onClose: () => void;
  onPaid: (sale: Sale) => Promise<void>;
}) {
  const [method, setMethod] = useState<"cash" | "gcash">("cash"),
    [tender, setTender] = useState((total / 100).toFixed(2)),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const sale = await invoke<Sale>({
        action: "pos.checkout",
        checkout: {
          id,
          items,
          method,
          tendered: method === "gcash" ? total : toCentavos(tender),
          ...(method === "gcash" ? { reference } : {}),
        },
      });
      await onPaid(sale);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Complete payment"
      subtitle="Confirm payment before recording this sale."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="payment-total">
        <span>Amount due</span>
        <strong>{peso(total)}</strong>
      </div>
      <div className="payment-methods">
        <button
          disabled={busy}
          className={method === "cash" ? "active" : ""}
          onClick={() => setMethod("cash")}
        >
          <Banknote size={22} />
          Cash
        </button>
        {gcash && (
          <button
            disabled={busy}
            className={method === "gcash" ? "active" : ""}
            onClick={() => setMethod("gcash")}
          >
            <Wallet size={22} />
            GCash
          </button>
        )}
      </div>
      <form onSubmit={submit}>
        {method === "cash" ? (
          <label>
            Cash received (PHP)
            <input
              autoFocus
              inputMode="decimal"
              required
              value={tender}
              disabled={busy}
              onChange={(e) => setTender(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              GCash reference · last 4 digits
              <input
                autoFocus
                inputMode="numeric"
                required
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="0042"
                value={reference}
                disabled={busy}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="check-option">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I verified receipt of this payment in the merchant account.
              </span>
            </label>
            <p className="form-note">
              OmniPOS records GCash payments; it does not confirm a transfer
              with GCash.
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
            Back
          </button>
          <button
            className="button primary"
            disabled={busy || (method === "gcash" && !confirmed)}
          >
            {busy ? (
              <Busy>Recording sale…</Busy>
            ) : (
              <>
                Confirm payment
                <Check size={17} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
