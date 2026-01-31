import { useEffect, useMemo, useRef, useState } from "react";
import { getItems, login, logout as apiLogout, me, register } from "./api";
import { connectSocket, disconnectSocket, getSocket } from "./socket";
import "./styles.css";

const UI_STORAGE_PREFIX = "lb_ui_state_v2";
const VIEW_MODE_KEY = "lb_view_mode";
const AUCTION_VERSION_KEY = "lb_auction_version_v1";

function uiKeyForUser(userId) {
    return `${UI_STORAGE_PREFIX}:${userId}`;
}
function auctionKeyForUser(userId) {
    return `${AUCTION_VERSION_KEY}:${userId}`;
}

function safeParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function loadUiState(userId) {
    const fallback = { hasBidByItem: {}, outbidByItem: {} };
    if (!userId) return fallback;
    return safeParse(localStorage.getItem(uiKeyForUser(userId)), fallback);
}

function saveUiState(userId, state) {
    if (!userId) return;
    localStorage.setItem(uiKeyForUser(userId), JSON.stringify(state));
}

function formatRemainingMs(ms) {
    if (ms <= 0) return "00:00";
    const totalSec = Math.ceil(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

function formatServerTime(ms) {
    return new Date(ms).toLocaleTimeString();
}

/* ------------------------- Auth Screen ------------------------- */
function AuthScreen({ onAuthed }) {
    const [mode, setMode] = useState("login");
    const [userId, setUserId] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        setErr("");
        setBusy(true);

        try {
            const uid = userId.trim();
            if (uid.length < 3) throw new Error("userId must be at least 3 characters");
            if (password.length < 6) throw new Error("password must be at least 6 characters");

            if (mode === "register") await register(uid, password);

            await login(uid, password);
            await onAuthed();
        } catch (e2) {
            setErr(e2?.message || "Authentication failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="wrap">
            <div className="card">
                <div className="title" style={{ fontSize: 18, fontWeight: 750 }}>
                    {mode === "login" ? "Login" : "Create account"}
                </div>

                <div className="sub" style={{ marginTop: 6 }}>
                    {mode === "login"
                        ? "Login to join the live auction."
                        : "Register to create a user ID and password."}
                </div>

                <form onSubmit={handleSubmit} style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <input
                        className="input"
                        placeholder="User ID (min 3 chars)"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        autoComplete="username"
                    />
                    <input
                        className="input"
                        placeholder="Password (min 6 chars)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />

                    {err ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{err}</div> : null}

                    <button className="btn" type="submit" disabled={busy}>
                        {busy ? "Please wait..." : mode === "login" ? "Login" : "Register + Login"}
                    </button>
                </form>

                <div className="sub" style={{ marginTop: 10 }}>
                    {mode === "login" ? (
                        <>
                            New user?{" "}
                            <button className="linkBtn" onClick={() => setMode("register")} type="button">
                                Create an account
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <button className="linkBtn" onClick={() => setMode("login")} type="button">
                                Login
                            </button>
                        </>
                    )}
                </div>

                <div className="sub" style={{ marginTop: 10 }}>
                    Tip: use Incognito or a different browser profile to test as another user.
                </div>
            </div>
        </div>
    );
}

/* ------------------------- Main App ------------------------- */
export default function App() {
    // ✅ Hooks declared unconditionally
    const [authChecked, setAuthChecked] = useState(false);
    const [user, setUser] = useState(null);

    const myUserId = user?.userId || null;

    const [items, setItems] = useState([]);
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [tick, setTick] = useState(0);

    const [hasBidByItem, setHasBidByItem] = useState({});
    const [outbidByItem, setOutbidByItem] = useState({});
    const [uiLoaded, setUiLoaded] = useState(false);

    const [flashGreenByItem, setFlashGreenByItem] = useState({});
    const [flashRedByItem, setFlashRedByItem] = useState({});

    const [viewMode, setViewMode] = useState(() => localStorage.getItem(VIEW_MODE_KEY) || "grid");
    const [categoryFilter, setCategoryFilter] = useState("All");

    // Tabs: all items vs user active bids (not ended)
    const [activeTab, setActiveTab] = useState("all"); // "all" | "myBids"

    useEffect(() => {
        localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }, [viewMode]);

    // Refs to avoid stale closures
    const hasBidRef = useRef(hasBidByItem);
    useEffect(() => {
        hasBidRef.current = hasBidByItem;
    }, [hasBidByItem]);

    const myUserIdRef = useRef(myUserId);
    useEffect(() => {
        myUserIdRef.current = myUserId;
    }, [myUserId]);

    // 1) Check existing session
    useEffect(() => {
        (async () => {
            try {
                const res = await me();
                setUser(res.user);
            } catch {
                setUser(null);
            } finally {
                setAuthChecked(true);
            }
        })();
    }, []);

    // 2) Load UI state when user changes
    useEffect(() => {
        setUiLoaded(false);

        if (!myUserId) {
            setHasBidByItem({});
            setOutbidByItem({});
            setUiLoaded(true);
            return;
        }

        const saved = loadUiState(myUserId);
        setHasBidByItem(saved.hasBidByItem || {});
        setOutbidByItem(saved.outbidByItem || {});
        setUiLoaded(true);
    }, [myUserId]);

    // 3) Persist UI state after loaded
    useEffect(() => {
        if (!user || !myUserId || !uiLoaded) return;
        saveUiState(myUserId, { hasBidByItem, outbidByItem });
    }, [myUserId, uiLoaded, hasBidByItem, outbidByItem]);

    // 4) Connect socket + load items when logged in
    useEffect(() => {
        if (!authChecked) return;

        if (!user) {
            disconnectSocket();
            setItems([]);
            setFlashGreenByItem({});
            setFlashRedByItem({});
            return;
        }

        const socket = connectSocket();

        getItems()
            .then((data) => {
                setItems(data.items);
                setServerOffsetMs(data.serverTime - Date.now());

                const uid = myUserIdRef.current;
                if (!uid) return;

                const auctionVersion = data.items
                    .map((i) => i.endsAt)
                    .sort((a, b) => a - b)
                    .join("|");
                const prev = localStorage.getItem(auctionKeyForUser(uid)) || "";

                if (prev && prev !== auctionVersion) {
                    setHasBidByItem({});
                    setOutbidByItem({});
                    saveUiState(uid, { hasBidByItem: {}, outbidByItem: {} });
                }

                localStorage.setItem(auctionKeyForUser(uid), String(auctionVersion));
            })
            .catch(console.error);

        const onUpdate = ({ item, serverTime, bidderId }) => {
            const uid = myUserIdRef.current;

            setServerOffsetMs(serverTime - Date.now());

            // bidder-only green flash
            if (uid && bidderId && bidderId === uid) {
                setFlashGreenByItem((m) => ({ ...m, [item.id]: true }));
                setTimeout(() => {
                    setFlashGreenByItem((m) => {
                        const { [item.id]: _, ...rest } = m;
                        return rest;
                    });
                }, 700);
            }

            setItems((prev) => {
                const prevItem = prev.find((x) => x.id === item.id);
                const wasWinning = prevItem?.highestBidder === uid;
                const nowWinning = item.highestBidder === uid;

                const iHaveBid = !!hasBidRef.current[item.id];

                if (iHaveBid && wasWinning && !nowWinning) {
                    setOutbidByItem((m) => ({ ...m, [item.id]: true }));

                    setFlashRedByItem((m) => ({ ...m, [item.id]: true }));
                    setTimeout(() => {
                        setFlashRedByItem((m) => {
                            const { [item.id]: _, ...rest } = m;
                            return rest;
                        });
                    }, 900);
                }

                if (iHaveBid && nowWinning) {
                    setOutbidByItem((m) => {
                        if (!m[item.id]) return m;
                        const { [item.id]: _, ...rest } = m;
                        return rest;
                    });
                }

                return prev.map((x) => (x.id === item.id ? item : x));
            });
        };

        socket.on("UPDATE_BID", onUpdate);
        return () => socket.off("UPDATE_BID", onUpdate);
    }, [authChecked, user]);

    // 5) countdown ticker
    useEffect(() => {
        if (!user) return;
        const id = setInterval(() => setTick((t) => t + 1), 250);
        return () => clearInterval(id);
    }, [user]);

    const serverNow = Date.now() + serverOffsetMs;

    function placeBid(itemId, currentBid, isWinning, ended) {
        if (ended || isWinning) return;

        setHasBidByItem((m) => ({ ...m, [itemId]: true }));

        const amount = currentBid + 10;
        const socket = getSocket();

        if (!socket) {
            alert("Socket not ready. Refresh and try again.");
            return;
        }

        socket.emit("BID_PLACED", { itemId, amount }, (resp) => {
            if (resp?.ok) return;

            if (resp?.code === "ALREADY_WINNING") {
                alert("You’re already the highest bidder.");
                return;
            }

            if (resp?.code === "OUTBID") {
                setOutbidByItem((m) => ({ ...m, [itemId]: true }));
                setFlashRedByItem((m) => ({ ...m, [itemId]: true }));
                setTimeout(() => {
                    setFlashRedByItem((m) => {
                        const { [itemId]: _, ...rest } = m;
                        return rest;
                    });
                }, 900);
            }

            if (resp?.code === "AUCTION_ENDED") alert("Auction ended.");
            if (resp?.code === "NOT_FOUND") alert("Item not found.");
        });
    }

    async function handleLogout() {
        try {
            await apiLogout();
        } catch {
            // ignore
        }

        disconnectSocket();

        setUiLoaded(false);

        setUser(null);

        setItems([]);
        setFlashGreenByItem({});
        setFlashRedByItem({});
        setHasBidByItem({});
        setOutbidByItem({});
        // setUiLoaded(false);


        setAuthChecked(true);
    }

    async function handleAuthed() {
        const res = await me();
        setUser(res.user);
    }

    // ✅ Derived data via useMemo (declared before returns, always runs in same order)
    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    }, [items]);

    const categories = useMemo(() => {
        const set = new Set(sortedItems.map((x) => x.category).filter(Boolean));
        return ["All", ...Array.from(set).sort()];
    }, [sortedItems]);

    const filteredByCategory = useMemo(() => {
        if (categoryFilter === "All") return sortedItems;
        return sortedItems.filter((x) => x.category === categoryFilter);
    }, [sortedItems, categoryFilter]);

    // const activeItems = useMemo(() => {
    //     return filteredByCategory.filter((item) => item.endsAt - serverNow > 0);
    // }, [filteredByCategory, serverNow, tick]); // tick forces re-evaluation on countdown

    // const myActiveBidItems = useMemo(() => {
    //     return activeItems.filter((item) => !!hasBidByItem[item.id]);
    // }, [activeItems, hasBidByItem]);

    const myBidItems = useMemo(() => {
        return filteredByCategory.filter((item) => {
            const iBid = !!hasBidByItem[item.id];
            if (!iBid) return false;

            const ended = item.endsAt - serverNow <= 0;
            const won = ended && item.highestBidder === myUserId;

            // include:
            // 1. active bids (winning or outbid)
            // 2. ended bids ONLY if user won
            return !ended || won;
        });
    }, [filteredByCategory, hasBidByItem, serverNow, myUserId, tick]);


    const visibleItems = useMemo(() => {
        return activeTab === "myBids" ? myBidItems : filteredByCategory;
    }, [activeTab, myBidItems, filteredByCategory]);


    // ✅ Only now we can return
    if (!authChecked) {
        return (
            <div className="wrap">
                <div className="card">
                    <div className="title">Loading...</div>
                </div>
            </div>
        );
    }

    if (!user) {
        return <AuthScreen onAuthed={handleAuthed} />;
    }

    return (
        <div className="wrap">
            <div className="header" style={{ justifyContent: "space-between" }}>
                <div>
                    {/* <div className="h1">Encore Biddings </div> */}
                    <h1 className="h1">Encore Biddings</h1>
                    <div className="sub">Logged in as: {user.userId}</div>
                    <div className="sub">Server time: {formatServerTime(serverNow)}</div>
                    <div className="sub">
                        Showing {visibleItems.length} of {items.length} items
                    </div>
                </div>

                <button className="btn" style={{ width: "auto" }} onClick={handleLogout}>
                    Logout
                </button>
            </div>

            {/* Tabs centered above controls */}
            <div className="controlsWrap">
                <div className="tabsRow">
                    <button
                        type="button"
                        className={"tabBtn" + (activeTab === "all" ? " active" : "")}
                        onClick={() => setActiveTab("all")}
                    >
                        All Items
                    </button>

                    <button
                        type="button"
                        className={"tabBtn" + (activeTab === "myBids" ? " active" : "")}
                        onClick={() => setActiveTab("myBids")}
                    >
                        My Bids <span className="tabCount">{myBidItems.length}</span>
                    </button>
                </div>

                {/* Filter + view toggle moved to the right */}
                <div className="controlsBar">
                    <div className="controlsLeft" />

                    <div className="controlsRight">
                        <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            {categories.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            className={"btn btn-secondary" + (viewMode === "grid" ? " active" : "")}
                            style={{ width: "auto" }}
                            onClick={() => setViewMode("grid")}
                        >
                            Grid
                        </button>

                        <button
                            type="button"
                            className={"btn btn-secondary" + (viewMode === "list" ? " active" : "")}
                            style={{ width: "auto" }}
                            onClick={() => setViewMode("list")}
                        >
                            List
                        </button>
                    </div>
                </div>
            </div>

            <div className={viewMode === "grid" ? "grid" : "list"}>
                {visibleItems.map((item) => {
                    const remainingMs = item.endsAt - serverNow;
                    const ended = remainingMs <= 0;

                    const isWinning = item.highestBidder === myUserId && !ended;
                    const isWinner = ended && item.highestBidder === myUserId;

                    const iHaveBid = !!hasBidByItem[item.id];
                    const outbid = iHaveBid && !!outbidByItem[item.id] && !ended;

                    const flashGreen = !!flashGreenByItem[item.id];
                    const flashRed = !!flashRedByItem[item.id];

                    const cardClass =
                        "card" +
                        (isWinner ? " winner" : "") +
                        (!isWinner && isWinning ? " winning-card" : "") +
                        (!isWinner && !isWinning && iHaveBid ? " my-bid" : "") +
                        (flashGreen ? " flash-green" : "") +
                        (flashRed ? " flash-red" : "") +
                        (ended ? " ended" : "");

                    return (
                        <div className={cardClass} key={item.id}>
                            <img
                                className="itemImg"
                                src={item.imageUrl}
                                alt={item.title}
                                loading="lazy"
                            />
                            <div className="row">
                                <div className="title">{item.title}</div>

                                <div className="badges">
                                    {isWinning ? <span className="badge winning">Winning</span> : null}
                                    {outbid ? <span className="badge outbid">Outbid</span> : null}
                                    {isWinner ? <span className="badge winner">Bid ended, you’re the winner</span> : ended ? <span className="badge ended">Ended</span> : null}
                                </div>
                            </div>

                            <div className="sub">
                                Slot #{item.slot} • {item.category}
                            </div>

                            <div className={"price" + (flashGreen ? " price-flash-green" : "") + (flashRed ? " price-flash-red" : "")}>
                                ${item.currentBid}
                            </div>

                            <div className="timer">Ends in: {formatRemainingMs(remainingMs)}</div>

                            <button className="btn" disabled={ended || isWinning} onClick={() => placeBid(item.id, item.currentBid, isWinning, ended)}>
                                {isWinner ? "Winner" : ended ? "Auction Ended" : isWinning ? "You’re Winning" : "Bid +$10"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
